# Release runbook — Fly.io + Supabase Postgres

This is the release path for the current foundation and validated lesson
generation slices. It deploys the server-rendered demo with synthetic data
only. Real student data, production authentication, A2UI publication, grading,
and adaptation remain outside the approved launch scope.

## Deployment shape

- Fly.io builds and runs the checked-in `Dockerfile`.
- Supabase provides the hosted PostgreSQL database.
- The server connects to PostgreSQL with the server-only `DATABASE_URL` secret.
- Validated lesson generation uses the server-only `OPENAI_API_KEY` secret.
- Fly runs the idempotent migration runner as a release command before
  replacing application Machines.
- The app does not use `supabase-js`, Supabase Auth, or the Supabase Data API;
  no browser key or public table grant is required.
- The existing `migrations/` directory and `pnpm db:migrate` runner remain the
  migration source of truth. Do not run `supabase db push` against this
  checkout unless the repository is intentionally converted to the standard
  `supabase/migrations/` layout.

Supabase's direct Postgres connection is the preferred option for migrations
and administration. For a persistent Fly backend on an IPv4-only network, use
the Supavisor session-mode connection string from the Supabase **Connect**
dialog. Keep `sslmode=require` in the connection string.

## One-time setup

Prerequisites: Docker, `pnpm`, the Fly CLI, a Supabase project, OpenAI API
access, and access to the Fly organization that owns the app.

1. Set the app name and `primary_region` in `fly.toml`. Keep the region close
   to the Supabase project when possible. The checked-in defaults are
   `edu-canvas` and `ams`; change them if the Fly app name is already taken or
   the database is elsewhere.
2. Authenticate and create the Fly app if it does not already exist:

   ```bash
   fly auth login
   fly apps create edu-canvas
   ```

   Skip `fly apps create` when the app already exists in the selected Fly
   organization.

3. Copy the PostgreSQL connection string from Supabase **Connect**. Use a
   database password managed in Supabase, never a value committed to this
   repository. Store the database URL and OpenAI key in Fly's encrypted secret
   store. Prefer `fly secrets import` from a protected terminal or secret
   manager so the values do not enter shell history:

   ```bash
   read -r -s -p 'Supabase DATABASE_URL: ' DATABASE_URL; printf '\n'
   read -r -s -p 'OpenAI API key: ' OPENAI_API_KEY; printf '\n'
   export DATABASE_URL OPENAI_API_KEY
   printf 'DATABASE_URL=%s\nOPENAI_API_KEY=%s\n' "$DATABASE_URL" "$OPENAI_API_KEY" | fly secrets import
   unset DATABASE_URL OPENAI_API_KEY
   ```

   A Supavisor session-mode URL is also valid. `OPENAI_MODEL` and
   `OPENAI_BASE_URL` are non-secret runtime settings in `fly.toml`. Do not put
   `DATABASE_URL`, `OPENAI_API_KEY`, or `SENTRY_DSN` in Docker build arguments
   or client-side `VITE_*` variables.

## Release procedure

Run these commands from the repository root or from the release worktree.

1. Verify the source and image:

   ```bash
   pnpm install --frozen-lockfile
   pnpm check
   docker build --tag edu-canvas:release .
   ```

2. For the first release, apply the forward-only migration and idempotent
   synthetic seed to Supabase before changing application traffic. Use the
   same connection string that is stored in Fly:

   ```bash
   export DATABASE_URL='postgresql://postgres:<password>@<host>:5432/postgres?sslmode=require'
   export OPENAI_API_KEY='use-a-securely-injected-key-here'
   APP_ENV=preview DEMO_MODE=false SYNTHETIC_DATA_ONLY=true pnpm db:migrate
   APP_ENV=preview DEMO_MODE=false SYNTHETIC_DATA_ONLY=true pnpm db:seed
   unset DATABASE_URL OPENAI_API_KEY
   ```

   The migration runner records applied files in `app_migrations` and takes a
   non-blocking advisory lock. On every later `fly deploy`, the Fly release
   command runs the same migration logic in a temporary Machine and aborts the
   deployment if it cannot complete. It never seeds or deletes data.
   Never edit an already-applied migration; add a new numbered file instead.

3. Deploy with a canary replacement and wait for Fly health checks:

   ```bash
   fly deploy --strategy canary --yes
   fly status
   fly checks list
   ```

4. Keep at least two stateless Machines in the primary region for availability
   once the app is live:

   ```bash
   fly scale count 2 --region ams --yes
   fly scale show
   ```

   Replace `ams` if `primary_region` was changed. This app stores data in
   Supabase and has no Fly volume, so Machines can be replaced independently.

5. Verify the public service. Replace the hostname if the Fly app name was
   changed:

   ```bash
   curl --fail --silent https://edu-canvas.fly.dev/api/health
   curl --fail --silent https://edu-canvas.fly.dev/api/readiness
   SMOKE_URL=https://edu-canvas.fly.dev pnpm smoke
   ```

Readiness must report `status: "ready"`, `config.persistence: "postgres"`,
and no configuration issues. Fly routes traffic only after both liveness and
readiness checks pass. Keep the previous release serving traffic if readiness
fails; fix the secret or database separately and redeploy.

## Operations

```bash
fly logs
fly releases
fly secrets list
fly scale show
```

Fly only displays secret names and digests, not secret values. Rotate the
Supabase database password in Supabase, update `DATABASE_URL` with
`fly secrets set`, and rerun the readiness and smoke checks.

Before opening this to real users, add a reviewed authentication model,
least-privilege database role, backups/restore evidence, alerting, TLS/domain
configuration, DPA/EU-residency approval, consent handling, and a separate
production seed policy. The current app intentionally keeps
`SYNTHETIC_DATA_ONLY=true`.

## References

- [Fly app deployment](https://fly.io/docs/launch/deploy/)
- [Fly app configuration](https://fly.io/docs/reference/configuration/)
- [Fly secrets](https://fly.io/docs/apps/secrets/)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase API exposure and RLS](https://supabase.com/docs/guides/api/securing-your-api)
