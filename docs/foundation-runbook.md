# Foundation and lesson-generation runbook — issues #2–#3, #18

This runbook covers the deployable walking-skeleton foundation, the first
teacher authoring slice, and bounded semantic validation. Lesson drafts are
structurally and semantically reviewed, persisted, and kept in a
teacher-review state; A2UI compilation, approval, publication, grading, and
adaptation remain later slices.

## Clean checkout

The default path needs no database or manual seed step:

```bash
pnpm install
pnpm dev
```

The app starts in deterministic `seeded-demo` mode when no environment file is present. It serves the role-limited teacher and student demo views using synthetic fixtures only.

## Local Git worktrees

Keep parallel working branches inside the ignored `.worktrees/` directory:

```bash
git fetch origin main
git worktree add -b feature/my-change .worktrees/my-change origin/main
```

Remove the linked worktree when the branch is no longer needed:

```bash
git worktree remove .worktrees/my-change
```

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

| Variable              | Default                   | Meaning                                                        |
| --------------------- | ------------------------- | -------------------------------------------------------------- |
| `APP_ENV`             | `development`             | `development`, `preview`, or `production`                      |
| `DEMO_MODE`           | `true` outside production | Keeps the seeded demo path explicit                            |
| `SYNTHETIC_DATA_ONLY` | `true`                    | Real-student mode is blocked by the foundation                 |
| `DATABASE_URL`        | unset                     | Optional `postgres://` or `postgresql://` persistence URL      |
| `PERSISTENCE_ADAPTER` | `postgres`                | Server-only PostgreSQL implementation: `postgres` or `drizzle` |
| `SENTRY_DSN`          | unset                     | Optional server-only Sentry delivery for scrubbed errors       |
| `OPENAI_API_KEY`      | unset in demo mode        | Server-only credential required when `DEMO_MODE=false`         |
| `OPENAI_MODEL`        | `gpt-5.6`                 | Server-selected structured-output model                        |
| `OPENAI_BASE_URL`     | OpenAI Responses API      | HTTPS provider endpoint; loopback HTTP is test-only            |

Invalid configuration fails readiness with field-level, secret-free diagnostics. The server never returns a database URL, API key, or private answer key in an error response.

Health/readiness and PostgreSQL persistence failures produce a structured error event through the observability seam. A valid `SENTRY_DSN` adds scrubbed delivery to Sentry; without it, structured logs remain the fallback. The DSN, Sentry SDK, student identifiers, and server-only observability markers must never enter the client bundle. See [AgDR-0003](agdr/AgDR-0003-server-observability.md) for the PII policy and fallback decision.

## PostgreSQL migration and seed

For a local PostgreSQL dependency:

```bash
docker compose up -d postgres
export DATABASE_URL=postgresql://edu_canvas:edu_canvas_dev@127.0.0.1:5432/edu_canvas
pnpm db:migrate
pnpm db:seed
```

`pnpm db:migrate` applies files in `migrations/` in lexical order and records each applied filename plus its SHA-256 checksum in `app_migrations`. Existing name-only ledger rows are baselined once; later edits to an applied file fail fast. Migrations are forward-only: do not edit an applied file or add a destructive reset command. Add a new numbered migration for schema changes.

`pnpm db:seed` is a thin operator entry point over `src/server/persistence/seed-postgres.ts`. The seed adapter uses stable IDs and `ON CONFLICT` upserts inside one transaction. It can be run repeatedly without duplicating the synthetic tenant, seeded identities, equivalent-fractions standard, prerequisite graph, activity version, or attempt fixture.

Drizzle is an incremental read/write adapter behind the existing persistence seam. Set `PERSISTENCE_ADAPTER=drizzle` to exercise it against the same PostgreSQL schema; omit the variable, or set it to `postgres`, to use the legacy adapter. The SQL migration runner remains authoritative for schema creation. Drizzle Kit uses the separate `drizzle` migration schema/table only for future ORM-owned migration metadata and must not be used to apply the existing `migrations/0001_foundation.sql` or `migrations/0002_lesson_generation.sql` files.

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

For teacher lesson generation, the trace is:

1. `src/routes/demo/$role.tsx` collects prompt, grade, standard, language, and optional difficulty.
2. `src/server/demo/server-function.ts` validates the server-function payload and resolves the seeded teacher session.
3. `src/server/generation/service.ts` applies safety checks, idempotency, the one-shot correction rule, and the durable state machine.
4. `src/server/generation/provider.ts` selects the deterministic fixture in seeded mode or the server-only GPT-5.6 adapter in PostgreSQL mode.
5. `src/server/generation/validation.ts` validates the canonical lesson contract and separates warnings from blocking errors.
6. `src/server/generation/semantic-validation.ts` runs deterministic curriculum and learning-quality validators against the normalized draft and the pinned graph context. It checks answer relationships, graph/path direction, grade, language/RTL, accessibility, explanation quality, and meaningful variant differentiation.
7. `src/server/generation/projection.ts` strips private relationships before returning the browser-safe draft. Semantic warnings are visible in the public diagnostics; semantic blocks and incomplete retryable validation return no draft.
8. `src/server/persistence/seeded.ts` or `src/server/persistence/postgres.ts` stores the request, attempts, diagnostics, and provenance.

The seeded teacher demo accepts `equivalent fractions for grade 4` and returns
exactly two standard variants, one scaffold, and one challenge variant. The
default fixture deliberately produces a teacher-visible quality warning when
variants share the same interaction structure; this is not a rewrite of the
canonical draft. A browser retry with the same idempotency key returns the existing attempt. The
seeded adapter's claim is atomic within its single-process demo; the
PostgreSQL adapter uses the database uniqueness constraint and transaction, so
concurrent duplicate submissions cannot invoke the provider twice within the
configured deployment. `Try this draft again` creates a new attempt on the
same request history. Duplicate readers wait for a bounded window; an
abandoned `generating` claim transitions to `failed-retryable` through a
tenant- and timestamp-scoped compare-and-swap, and final writes use the same
ownership guard so an expired worker cannot overwrite a later retry.

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

The foundation shell uses current shadcn Base UI components and keeps the visual surface small. CSS uses logical properties (`padding-inline`, `margin-block`, `inset-inline`, `border-block`, and `border-inline`) so the layout can move to Arabic RTL without a second stylesheet. It also preserves browser zoom, uses semantic document order, keeps primary targets at least 48px on narrow screens, and honors `prefers-reduced-motion`. Core lesson interactions will use semantic DOM/A2UI components; HTML-in-Canvas is optional enhancement only and must never be required for the demo or accessibility path.

These choices follow Google’s responsive/accessibility guidance and Core Web Vitals priorities:

- [Accessible responsive design](https://web.dev/articles/accessible-responsive-design)
- [The most effective ways to improve Core Web Vitals](https://web.dev/articles/top-cwv)
- [Responsive web design basics](https://web.dev/articles/responsive-web-design-basics)

## Known risks and deliberate gaps

- Demo identities are seeded role fixtures, not production authentication. This is an explicit demo limitation.
- PostgreSQL is optional in clean-demo mode; a deployed production environment should use managed PostgreSQL and verify the forced row-level policy path with a least-privilege database role.
- Issue #18's bounded curriculum and learning-quality validation is shipped; issue #28 adds the cross-cutting hard safety gate; issue #4 consumes only accepted drafts for allowlisted A2UI preview. SSE transport, teacher approval/publication, grading, and adaptation remain follow-up slices. A generated lesson is never auto-published.
- The real-student compliance gate (DPA, EU residency, security, and consent) remains closed.
