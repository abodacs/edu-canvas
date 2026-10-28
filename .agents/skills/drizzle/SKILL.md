---
name: drizzle
description: "Drizzle ORM and migration skill for Edu-Canvas. Use when: (1) changing drizzle/schema.ts or adding a table, column, index, check, foreign key, or policy, (2) generating, reviewing, or debugging a migration under drizzle/, (3) writing a `generate --custom` migration for forced RLS, triggers, or functions, (4) investigating schema drift or a failed db:setup, release-command migration, or db:drizzle:check, (5) writing Drizzle queries, relations, transactions, or inferred types in src/server/persistence/, (6) deciding whether raw SQL or the query builder is correct here."
---

# Drizzle in Edu-Canvas

`drizzle/schema.ts` is the single source of truth. SQL files under `drizzle/` are generated artifacts. The app never migrates at startup; Fly runs `scripts/database-migrate-runtime.mjs` as its release command.

Installed: `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10, `postgres` 3.4.9, PostgreSQL 17.

## Commands

```bash
pnpm db:generate        # schema.ts -> SQL + meta/
pnpm db:migrate         # journal-ordered apply, advisory lock, preflight
pnpm db:setup           # migrate, then seed
pnpm db:drizzle:check   # journal/snapshot integrity
pnpm test:database      # both adapters against a migrated DB
```

Custom migration:

```bash
pnpm exec drizzle-kit generate --custom --name <name>
```

## Rules

1. Change `schema.ts`, then run `pnpm db:generate`. Never hand-edit a generated `.sql` file. If the output is wrong, fix `schema.ts` and regenerate.
2. Commit `schema.ts`, the new `.sql`, and `meta/`. The snapshot is the diff base for the next generate.
3. Anything the snapshot cannot express goes in a `generate --custom` file: `force row level security`, triggers, and functions. Current example: `drizzle/0001_foundation_behaviors.sql`.
4. Never put snapshot-visible DDL (tables, columns, constraints, indexes, policies) in a custom file. Drizzle does not record it, so the next `generate` repeats it and you get a duplicate-object failure.
5. Applied migrations are immutable. Add a new migration; do not edit an old one.
6. Never reorder, rename, or hand-edit `meta/_journal.json`.
7. Never run `drizzle-kit push`, `drizzle-kit pull`, or `supabase db push` in this repo. Push bypasses the journal; pull overwrites the authored schema and drops the forced-RLS and trigger layer.
8. Migrations are forward-only. There are no down migrations. Fix forward.
9. Primary keys stay application-generated UUIDv7 `text` (`src/server/ids.ts`). Do not add a `uuid` column type, `.defaultRandom()`, or `gen_random_uuid()`.
10. System constants belong in migrations. Demo users, tenants, and fixtures belong in `pnpm db:seed`, which is idempotent (`ON CONFLICT`) and already covered by repeated CI runs.

## Schema recipes

| Change | Where |
| --- | --- |
| Column | Column entry in `schema.ts`; nullability and `.notNull()` are part of the contract |
| Check / unique / FK | Extra-config array, after the columns |
| Index | `index("name").using("btree", col.asc().nullsLast(), col.desc().nullsFirst())` |
| Policy | `pgPolicy(...)` in extra config **and** `.enableRLS()` on the table |
| Forced RLS / trigger / function | `generate --custom` only |

Two verified serializer traps:

- `.enableRLS()` is what emits `ENABLE ROW LEVEL SECURITY`. `pgPolicy` alone creates the policy on a table where RLS stays **off**.
- An explicit `.op("text_ops")` suppresses `.desc()` in generated index SQL. Do not add default opclasses; the baseline keeps `DESC` only when the opclass is absent.

## Gotchas

| Symptom | Cause | Action |
| --- | --- | --- |
| A migration is silently not applied | Drizzle compares only the newest ledger row and skips entries whose journal `when` is older | The runner's preflight throws instead. Regenerate the migration so its timestamp is current |
| `Migration … has no ledger entry and is not newer…` | The file was edited after apply, or a branch merge produced an older timestamp | Revert the edit, or regenerate the migration with a new timestamp |
| Duplicate table/column on the next release | Snapshot-visible DDL was placed in a custom migration | Move it into `schema.ts` and regenerate |
| Policy exists but rows leak | `.enableRLS()` missing | Add it to the table |
| `db:generate` produces a diff in CI | `schema.ts` changed without a committed migration | Run `pnpm db:generate` and commit the output |
| `No files matching` in `format` | A path in the format script no longer exists | Fix the script path list |

Facts about the installed migrator:

- All pending migrations run in **one transaction**. A late failure rolls back the whole batch.
- Generated SQL has **no `IF NOT EXISTS`**. The hash ledger is the only re-run guard.
- The ledger is `drizzle.__edu_canvas_drizzle_migrations` (`id`, `hash`, `created_at`), not `public.app_migrations`.
- `drizzle-kit check` validates journal/snapshot integrity only. It does not compare SQL with `schema.ts`; the CI generate-and-diff step does.

## Queries

Use the query builder in the Drizzle adapter.

```ts
import { eq, and } from "drizzle-orm";

const rows = await db.select().from(users).where(eq(users.id, id));
await db.insert(users).values(user).returning();
type SelectUser = typeof users.$inferSelect;
type InsertUser = typeof users.$inferInsert;
```

- Nested reads: `db.query.users.findMany({ with: { posts: true } })`.
- Multi-write: `db.transaction(async (tx) => { ... })`. Never send `BEGIN`/`COMMIT` by hand.
- Conditional clauses: `.$dynamic()`.
- Hot loops: `.prepare()` plus `sql.placeholder()`.
- No Prisma syntax (`model`, `@id`, `@relation`). Relations come from `relations()`; keys come from the table.
- Raw SQL is intentional in `src/server/persistence/postgres.ts` and the generation persistence layer. Do not rewrite those adapters into the builder as part of an unrelated change.
- The Drizzle client is created once per adapter (`src/server/persistence/drizzle.ts`) with bounded `max` and timeouts. Do not create a client per request.

## Verification

1. `pnpm db:generate` → `git diff --exit-code -- drizzle` must be clean.
2. `pnpm db:drizzle:check`.
3. `pnpm db:setup` on a disposable DB, then run it again; the second run must be a no-op.
4. `pnpm test:database` (both adapters).
5. For RLS/trigger work, query the catalog: every application table must show `relrowsecurity` and `relforcerowsecurity` true; the policy and trigger counts must match the schema.

## Bounds

This skill covers the installed versions and the current `schema.ts`. It does not prove that a generated baseline is semantically equivalent to the previous one; that requires the catalog comparison recorded in [AgDR-0010](../../docs/agdr/AgDR-0010-drizzle-migration-ownership.md). Migration rollback, blue/green cutovers, and Supabase-specific migration tooling are out of scope.
