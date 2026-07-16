# Foundation runbook — issue #2

This runbook covers the deployable walking-skeleton foundation. It intentionally stops before lesson generation, A2UI compilation, grading, and adaptation.

## Clean checkout

The default path needs no database or manual seed step:

```bash
pnpm install
pnpm dev
```

The app starts in deterministic `seeded-demo` mode when no environment file is present. It serves the role-limited teacher and student demo views using synthetic fixtures only.

The release-shaped check is:

```bash
pnpm check
```

That runs formatting, lint, strict TypeScript, unit tests, and the production build. After `pnpm start`, the smoke check exercises `/`, both demo roles, `/api/health`, and `/api/readiness`:

```bash
pnpm smoke
```

## Configuration

Copy `.env.example` to `.env` only when you need local overrides. Unprefixed values are server-only; do not add secrets to `VITE_*` variables or client code.

| Variable              | Default                   | Meaning                                                   |
| --------------------- | ------------------------- | --------------------------------------------------------- |
| `APP_ENV`             | `development`             | `development`, `preview`, or `production`                 |
| `DEMO_MODE`           | `true` outside production | Keeps the seeded demo path explicit                       |
| `SYNTHETIC_DATA_ONLY` | `true`                    | Real-student mode is blocked by the foundation            |
| `DATABASE_URL`        | unset                     | Optional `postgres://` or `postgresql://` persistence URL |

Invalid configuration fails readiness with field-level, secret-free diagnostics. The server never returns a database URL, API key, or private answer key in an error response.

## PostgreSQL migration and seed

For a local PostgreSQL dependency:

```bash
docker compose up -d postgres
export DATABASE_URL=postgresql://edu_canvas:edu_canvas_dev@127.0.0.1:5432/edu_canvas
pnpm db:migrate
pnpm db:seed
```

`pnpm db:migrate` applies files in `migrations/` in lexical order and records each applied filename in `app_migrations`. Migrations are forward-only: do not edit an applied file or add a destructive reset command. Add a new numbered migration for schema changes.

`pnpm db:seed` is a thin operator entry point over `src/server/persistence/seed-postgres.ts`. The seed adapter uses stable IDs and `ON CONFLICT` upserts inside one transaction. It can be run repeatedly without duplicating the synthetic tenant, seeded identities, equivalent-fractions standard, prerequisite graph, activity version, or attempt fixture.

Migration and seed processes take the same non-blocking PostgreSQL advisory lock and use bounded statement, lock, and idle-in-transaction timeouts. If another bootstrap process is running, the command fails quickly so a deploy cannot wait indefinitely behind a hidden database lock.

The PostgreSQL schema includes tenant columns on every tenant-owned table, forced row-level policies keyed by the transaction-local `app.tenant_id`, and same-tenant foreign keys for tenant-owned relationships. Published activity versions and attempts are immutable at the database seam; rerunning the seed leaves existing immutable rows untouched. Application code also asserts the tenant at the server boundary.

## Module navigation

For a request to `/demo/student`, use the file names as the trace:

1. `src/routes/demo/$role.tsx` validates the delivery path.
2. `src/server/demo/server-function.ts` validates server-function input.
3. `src/server/demo/read-model.ts` assembles the public snapshot.
4. `src/server/demo/policy.ts` resolves the seeded role and tenant policy.
5. `src/server/persistence.ts` selects the persistence seam.
6. `src/server/persistence/seeded.ts` or `src/server/persistence/postgres.ts` implements the selected adapter.

The browser-safe contract is `src/shared/demo-contract.ts`. The private answer key remains in `src/server/seed-data.ts` and the PostgreSQL adapter; it is not part of the public snapshot.

## Health and readiness

- `GET /api/health` is a cheap liveness check. It does not touch PostgreSQL.
- `GET /api/readiness` checks safe configuration and either the synthetic repository or PostgreSQL with a bounded five-second connection/query timeout.
- Readiness returns `200` only when the app can serve the configured persistence mode; invalid configuration or unavailable PostgreSQL returns `503`.

Use the endpoint output as deployment evidence, not as a place to expose connection details.

## Safe redeploy

1. Run `pnpm check` and record the commit/artifact identifier.
2. Apply forward-only migrations before switching application traffic.
3. Run the idempotent seed only for the synthetic demo environment.
4. Start the new artifact with the same server-only configuration.
5. Require `/api/health`, `/api/readiness`, and `pnpm smoke` to pass before declaring the preview ready.
6. If readiness fails, keep the previous application artifact serving traffic and fix configuration or persistence separately. Do not mutate or delete immutable activity/attempt rows to roll back a release.

Connection pools are deliberately small for this slice, health checks have bounded timeouts, and diagnostics are redacted. Production hosting must add provider-level backups, alerting, TLS, and secret rotation before real-student launch.

## UI guardrails

The foundation shell uses current shadcn Base UI components and keeps the visual surface small. CSS uses logical properties (`padding-inline`, `margin-block`, `inset-inline`, `border-block`, and `border-inline`) so the layout can move to Arabic RTL without a second stylesheet. It also preserves browser zoom, uses semantic document order, keeps primary targets at least 48px on narrow screens, and honors `prefers-reduced-motion`.

These choices follow Google’s responsive/accessibility guidance and Core Web Vitals priorities:

- [Accessible responsive design](https://web.dev/articles/accessible-responsive-design)
- [The most effective ways to improve Core Web Vitals](https://web.dev/articles/top-cwv)
- [Responsive web design basics](https://web.dev/articles/responsive-web-design-basics)

## Known risks and deliberate gaps

- Demo identities are seeded role fixtures, not production authentication. This is an explicit demo limitation.
- PostgreSQL is optional in clean-demo mode; a deployed production environment should use managed PostgreSQL and verify the forced row-level policy path with a least-privilege database role.
- No lesson generation, chat helper, A2UI catalog, grading, or adaptation code belongs in this issue. New requirements must become follow-up issues.
- The real-student compliance gate (DPA, EU residency, security, and consent) remains closed.
