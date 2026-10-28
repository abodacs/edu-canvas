# Drizzle schema and migrations

`drizzle/schema.ts` is the single source of truth for the database schema. The SQL files in this directory are generated artifacts; they are not written by hand.

## Commands

```bash
pnpm db:generate   # diff schema.ts against the snapshot and write SQL
pnpm db:migrate    # apply journal-ordered SQL with the bootstrap lock
pnpm db:setup      # migrate, then seed
pnpm db:drizzle:check
```

Custom migrations use the same journal:

```bash
pnpm exec drizzle-kit generate --custom --name <name>
```

## What lives where

| Path | Role |
| --- | --- |
| `schema.ts` | Authored tables, columns, checks, foreign keys, indexes, policies, `enableRLS()` |
| `0000_baseline.sql` | Generated baseline |
| `0001_foundation_behaviors.sql` | Hand-written: `force row level security`, immutability function and triggers |
| `meta/_journal.json` | Applied order and timestamps |
| `meta/*_snapshot.json` | The diff base for the next `generate` |

## Rules

1. Change `schema.ts`, then run `pnpm db:generate`. Never edit a generated SQL file.
2. Use `generate --custom` only for what the snapshot cannot express: `force row level security`, triggers, and functions. Snapshot-visible DDL inside a custom file is invisible to later `generate` runs.
3. Applied migrations are immutable. The runner rejects an edited file or an out-of-order journal entry instead of skipping it.
4. Migrations are forward-only. There are no down migrations; fix forward.
5. Never run `drizzle-kit push` (bypasses the journal) or `drizzle-kit pull` (overwrites the authored schema and loses the forced-RLS layer).
6. Commit `schema.ts`, the SQL files, and `meta/`.
7. Primary keys stay application-generated UUIDv7 text (`src/server/ids.ts`). Do not add a `uuid` column type or a database default.

## Apply path

`scripts/database-migrate-runtime.mjs` takes the bootstrap advisory lock, checks the journal against `drizzle.__edu_canvas_drizzle_migrations`, then calls Drizzle's `migrate()`. Fly runs it as the release command. The server never migrates at startup.
