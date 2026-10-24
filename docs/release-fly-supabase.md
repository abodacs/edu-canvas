# Release runbook — Fly.io + Supabase Postgres

This runbook owns two deployment stages of the same product (reconciled 2026-10-25, [#89](https://github.com/abodacs/edu-canvas/issues/89)):

1. **Validation milestone** (current): the single-instance deployment below serves the working loop with synthetic data and invitation sessions — used for the hackathon event and other external validation.
2. **Production**: the same application behind the [production requirements](#production-requirements-not-yet-met). None of the milestone configuration satisfies them. A2UI publication, grading, and adaptation ship with the loop; real student data, production authentication, and the production shape do not exist yet.

The runbook makes no production-readiness or availability claim for the milestone deployment.

## Deployment shape

- Fly.io builds and runs the checked-in `Dockerfile`.
- Supabase provides the hosted PostgreSQL database.
- **One continuously running Fly.io instance.** The preview uses server-sent events, and the current request limits are process-local. Multiple instances would need shared request-limit state first, so scaling out stays out of scope until the production path adds it ([design decision Q12](design/design-doc-questions.md), [AgDR-0007](agdr/AgDR-0007-demo-access-and-deployment.md)).
- The server connects to PostgreSQL with the server-only `DATABASE_URL` secret.
- Lesson generation uses the server-only provider key secret. The product runs its selected model behind the existing provider interface; see [AgDR-0006](agdr/AgDR-0006-provider-selection-and-deadlines.md) for the provider selection and deadlines. The historical `OPENAI_API_KEY`/`OPENAI_MODEL` secret and setting names are kept until the provider migration lands ([AgDR-0006](agdr/AgDR-0006-provider-selection-and-deadlines.md)).
- Fly runs the idempotent migration runner as a release command before replacing application Machines.
- The app does not use `supabase-js`, Supabase Auth, or the Supabase Data API; no browser key or public table grant is required.
- The existing `migrations/` directory and `pnpm db:migrate` runner remain the migration source of truth. Do not run `supabase db push` against this checkout unless the repository is intentionally converted to the standard `supabase/migrations/` layout.

Supabase's direct Postgres connection is the preferred option for migrations and administration. For a persistent Fly backend on an IPv4-only network, use the Supavisor session-mode connection string from the Supabase **Connect** dialog. Keep `sslmode=require` in the connection string.

## One-time setup

Prerequisites: Docker, `pnpm`, the Fly CLI, a Supabase project, generation-provider API access (the selected provider; see `docs/agdr/AgDR-0006-provider-selection-and-deadlines.md`), and access to the Fly organization that owns the app.

1. Set the app name and `primary_region` in `fly.toml`. Keep the region close to the Supabase project when possible. The checked-in defaults are `edu-canvas` and `ams`; change them if the Fly app name is already taken or the database is elsewhere.
2. Authenticate and create the Fly app if it does not already exist:

   ```bash
   fly auth login
   fly apps create edu-canvas
   ```

   Skip `fly apps create` when the app already exists in the selected Fly organization.

3. Copy the PostgreSQL connection string from Supabase **Connect**. Use a database password managed in Supabase, never a value committed to this repository. Store the database URL and generation-provider key in Fly's encrypted secret store. Prefer `fly secrets import` from a protected terminal or secret manager so the values do not enter shell history:

   ```bash
   read -r -s -p 'Supabase DATABASE_URL: ' DATABASE_URL; printf '\n'
   read -r -s -p 'Provider API key (stored as OPENAI_API_KEY): ' OPENAI_API_KEY; printf '\n'
   export DATABASE_URL OPENAI_API_KEY
   printf 'DATABASE_URL=%s\nOPENAI_API_KEY=%s\n' "$DATABASE_URL" "$OPENAI_API_KEY" | fly secrets import
   unset DATABASE_URL OPENAI_API_KEY
   ```

   A Supavisor session-mode URL is also valid. `OPENAI_MODEL` and `OPENAI_BASE_URL` are non-secret runtime settings in `fly.toml`. Do not put `DATABASE_URL`, `OPENAI_API_KEY`, or `SENTRY_DSN` in Docker build arguments or client-side `VITE_*` variables.

## Release procedure

Run these commands from the repository root or from the release worktree.

1. Verify the source and image:

   ```bash
   pnpm install --frozen-lockfile
   pnpm check
   docker build --tag edu-canvas:release .
   ```

2. For the first release, apply the forward-only migration and idempotent synthetic seed to Supabase before changing application traffic. Use the same connection string that is stored in Fly:

   ```bash
   export DATABASE_URL='postgresql://postgres:<password>@<host>:5432/postgres?sslmode=require'
   APP_ENV=preview DEMO_MODE=false SYNTHETIC_DATA_ONLY=true pnpm db:migrate
   APP_ENV=preview DEMO_MODE=false SYNTHETIC_DATA_ONLY=true pnpm db:seed
   unset DATABASE_URL
   ```

   Database bootstrap does not call the lesson-generation provider, so it does not require `OPENAI_API_KEY`. The running Fly application still receives that credential through its server-only secret store.

   The migration runner records each applied file and its SHA-256 checksum in `app_migrations` and takes a non-blocking advisory lock. Existing name-only ledger rows are baselined once; later edits to an applied file fail the release. On every later `fly deploy`, the Fly release command runs the same migration logic in a temporary Machine and aborts the deployment if it cannot complete. It never seeds or deletes data. Never edit an already-applied migration; add a new numbered file instead.

3. Deploy with a canary replacement and wait for Fly health checks:

   ```bash
   fly deploy --strategy canary --yes
   fly status
   fly checks list
   ```

4. Keep exactly **one** application Machine in the primary region:

   ```bash
   fly scale count 1 --region ams --yes
   fly scale show
   ```

   Replace `ams` if `primary_region` was changed. This app stores data in Supabase and has no Fly volume, so the Machine can be replaced independently. Do not scale out: SSE preview delivery and the process-local burst limits assume a single instance ([Q12](design/design-doc-questions.md)); shared limit state is a prerequisite for more than one Machine and is a production-path item, not a milestone one.

5. Verify the public service. Replace the hostname if the Fly app name was changed:

   ```bash
   curl --fail --silent https://edu-canvas.fly.dev/api/health
   curl --fail --silent https://edu-canvas.fly.dev/api/readiness
   SMOKE_URL=https://edu-canvas.fly.dev pnpm smoke
   ```

Readiness must report `status: "ready"`, `config.persistence: "postgres"`, and no configuration issues. Fly routes traffic only after both liveness and readiness checks pass. Keep the previous release serving traffic if readiness fails; fix the secret or database separately and redeploy.

### Access and usage limits (required before any public URL)

The [implementation contracts](design/design-doc-implementation.md#apply-access-limits-and-safe-release-changes) define the limits; the deployment must have them active. Verify each before giving the URL to anyone:

- Database-backed generation quotas in Postgres: at most 10 generation attempts per teacher per hour and 100 per tenant per day. Corrections count against the provider-call budget; all generation stops at 200 provider calls per tenant per day.
- Process-local burst limits: at most 30 authoring requests per session per minute and at most one active generation per teacher. Rejected requests receive a stated retry interval (`RATE_LIMITED`, HTTP 429).
- Separate teacher and learner invitation credentials exchanged for signed, HttpOnly, Secure, SameSite session cookies; no invitation credential in client bundles or repository files.

## Operations

```bash
fly logs
fly releases
fly secrets list
fly scale show
```

Fly only displays secret names and digests, not secret values. Rotate the Supabase database password in Supabase, update `DATABASE_URL` with `fly secrets set`, and rerun the readiness and smoke checks.

## Production requirements (not yet met)

Every item below is required before this deployment serves real users. None is satisfied by the milestone configuration; each needs an owner and evidence before launch.

- **Authentication and sessions.** A reviewed authentication model for every user; invitation credentials and seeded identities end. Role and identity derive only from protected server sessions ([Q16](design/design-doc-questions.md)).
- **Shared request-limit state.** The database-backed quotas stay; the process-local burst limits must move to shared state before the app runs on more than one Machine.
- **Data protection.** Least-privilege database role, backups with tested restore evidence, DPA, EU-residency approval, consent handling, and a separate production seed/data policy. `SYNTHETIC_DATA_ONLY=true` stays until all of them pass.
- **Operations.** TLS/domain configuration, alerting, log retention that keeps answer keys and learner data out of operational logs, and measured production targets (10-second draft p95, 500-millisecond render p95, 99.9% published availability — reference values, to be measured).
- **Capacity and cost.** Provider-call budgets per tenant measured against real cost; quota defaults reviewed against billing before opening generation to real classrooms.

## References

- [Fly app deployment](https://fly.io/docs/launch/deploy/)
- [Fly app configuration](https://fly.io/docs/reference/configuration/)
- [Fly secrets](https://fly.io/docs/apps/secrets/)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase API exposure and RLS](https://supabase.com/docs/guides/api/securing-your-api)
