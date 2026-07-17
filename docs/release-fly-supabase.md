# Release runbook — Fly.io + Supabase Postgres

This is the release path for the current foundation slice. It deploys the
server-rendered demo with synthetic data only. Real student data, production
authentication, lesson generation, grading, and adaptation remain outside the
approved launch scope.

## Deployment shape

- Fly.io builds and runs the checked-in `Dockerfile`.
- Supabase provides the hosted PostgreSQL database.
- The server connects to PostgreSQL with the server-only `DATABASE_URL` secret.
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

Prerequisites: Docker, `pnpm`, the Fly CLI, a Supabase project, and access to
the Fly organization that owns the app.

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
   repository. Store it in Fly's encrypted secret store:

   ```bash
   fly secrets set DATABASE_URL='postgresql://postgres:<password>@<host>:5432/postgres?sslmode=require'
   ```

   A Supavisor session-mode URL is also valid. Do not put `DATABASE_URL` in
   `fly.toml`, `.env.example`, Docker build arguments, or a client-side
   `VITE_*` variable.

## Release procedure

Run these commands from the repository root or from the release worktree.

1. Verify the source and image:

   ```bash
   pnpm install --frozen-lockfile
   pnpm check
   docker build --tag edu-canvas:release .
   ```

2. Apply the forward-only migration and idempotent synthetic seed to the
   Supabase database before changing application traffic. Use the same
   connection string that will be stored in Fly:

   ```bash
   export DATABASE_URL='postgresql://postgres:<password>@<host>:5432/postgres?sslmode=require'
   APP_ENV=preview DEMO_MODE=false SYNTHETIC_DATA_ONLY=true pnpm db:migrate
   APP_ENV=preview DEMO_MODE=false SYNTHETIC_DATA_ONLY=true pnpm db:seed
   unset DATABASE_URL
   ```

   The migration runner records applied files in `app_migrations` and takes a
   non-blocking advisory lock. Never edit an already-applied migration; add a
   new numbered file instead.

3. Deploy with a canary replacement and wait for Fly health checks:

   ```bash
   fly deploy --strategy canary --yes
   fly status
   fly checks list
   ```

4. Verify the public service. Replace the hostname if the Fly app name was
   changed:

   ```bash
   curl --fail --silent https://edu-canvas.fly.dev/api/health
   curl --fail --silent https://edu-canvas.fly.dev/api/readiness
   SMOKE_URL=https://edu-canvas.fly.dev pnpm smoke
   ```

Readiness must report `status: "ready"`, `config.persistence: "postgres"`,
and no configuration issues. Keep the previous release serving traffic if
readiness fails; fix the secret or database separately and redeploy.

## Operations

```bash
fly logs
fly releases
fly secrets list
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
