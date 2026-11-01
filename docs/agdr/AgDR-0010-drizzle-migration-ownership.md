# AgDR-0010 — Drizzle owns the schema and the migration journal

> In the context of two parallel schema histories — hand-written SQL applied by a checksum runner, and a Drizzle snapshot used only for query typing — facing the choice between keeping SQL authoritative, letting Drizzle compile while the old runner applies, and handing both authoring and application to Drizzle, I decided that `drizzle/schema.ts` is the single source of truth, `drizzle-kit generate` owns the SQL, and Drizzle's migrator applies journal-ordered files under the existing bootstrap advisory lock, to make schema drift structurally impossible while keeping forced row-level security, triggers, and functions in reviewable custom migrations, accepting that migrations become forward-only with no `if not exists` tolerance, that Drizzle applies all pending files in one transaction, and that the old `app_migrations` ledger is retired.

Recorded 2026-10-28.

## Context

Before this decision the repository had two schema histories that could disagree.

- `migrations/*.sql` was executable authority. `scripts/database-migrate-runtime.mjs` applied files in lexical order, recorded SHA-256 checksums in `app_migrations`, held a non-blocking advisory lock, and ran each file in its own transaction.
- `drizzle/schema.ts` was a `drizzle-kit pull` snapshot used for query types. `drizzle/meta/0000_snapshot.json` was captured on 2026-07-18.
- `migrations/0003_generation_request_hash.sql` added `request_hash` and its index. The column was hand-added to `schema.ts`; the index was not. The snapshot still described the July schema. `drizzle-kit check` passed because it validates journal metadata, not agreement with the SQL.
- `drizzle.config.ts` already pointed at a separate `drizzle.__edu_canvas_drizzle_migrations` ledger for a future ownership change.

The security model needs SQL the snapshot cannot express. `drizzle-kit` 0.31.10 emits `ALTER TABLE … ENABLE ROW LEVEL SECURITY` only when a table declares `.enableRLS()`, and it has no representation for `FORCE ROW LEVEL SECURITY`, triggers, or PL/pgSQL functions. All ten application tables are forced-RLS, and two carry immutability triggers.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| **A. Drizzle owns authoring and application** | One schema source; drift becomes impossible by construction; standard journal and ledger; `generate --custom` keeps RLS-forcing SQL reviewable; CI can fail on any generated diff | No down migrations; generated SQL is not idempotent; all pending files run in one transaction; Drizzle silently skips out-of-order entries unless guarded |
| B. Drizzle compiles, the checksum runner applies | Keeps per-file transactions, `app_migrations`, and the advisory lock | Keeps a custom applier and two ledger conventions; no standard tooling benefit; baseline still needed |
| C. Keep SQL authoritative, add a drift check | Smallest change; no applier rewrite | Two histories remain; drift detection is a capture-and-diff heuristic; the snapshot stays a hand-maintained artifact |

## Decision

**Option A.**

1. `drizzle/schema.ts` is authored. All ten policy tables declare `.enableRLS()`. `drizzle-kit generate` writes DDL, constraints, indexes, policies, and RLS enablement.
2. `drizzle/0001_foundation_behaviors.sql` is a `generate --custom` migration. It owns `force row level security`, `prevent_immutable_foundation_row_change()`, and the two immutability triggers. Custom migrations must not contain snapshot-visible DDL: Drizzle does not record it, so the next `generate` would repeat it.
3. `scripts/database-migrate-runtime.mjs` wraps Drizzle's `migrate()` in `withFoundationBootstrapLock`. The ledger is `drizzle.__edu_canvas_drizzle_migrations`. The server never migrates at startup; Fly runs the script as its release command.
4. A preflight guard reads `meta/_journal.json` and the ledger before applying anything. It rejects a non-increasing journal timestamp, and it rejects an unapplied entry whose timestamp is not newer than the newest applied row. This turns Drizzle's silent skip into a failed release. It also restores the old runner's "applied migrations are immutable" property, because an edited file no longer matches its ledger hash.
5. `drizzle-kit push` and `drizzle-kit pull` are forbidden. Push bypasses the journal. Pull overwrites the authored schema and loses the forced-RLS and trigger layer.
6. `app_migrations` is retired. No code read it, and no deployed database existed at the switch.
7. Primary keys are unchanged: application-generated UUIDv7 `text` with no database default ([AgDR-0015](AgDR-0015-primary-key-identifier-strategy.md)).

CI runs `pnpm db:generate` and fails on any resulting `drizzle/` diff, so a schema edit without a migration, or an edited migration, cannot merge.

## Consequences

- The equivalence gate compared a database built from the old SQL with one built from the new journal: identical columns, constraints, indexes, policies, triggers, and function, except the intentional removal of `app_migrations`. Catalog checks reported 10 of 10 tables with both `relrowsecurity` and `relforcerowsecurity`, 10 policies, 2 triggers, and 1 function.
- The gate caught the missing `lesson_generation_attempts_request_hash_idx`, which the stale snapshot had never recorded. That index is now in `schema.ts` and the baseline.
- There are no down migrations. A bad release is fixed forward.
- Generated SQL has no `IF NOT EXISTS`. The hash ledger is the only re-run guard; a lost ledger fails loudly on existing objects.
- All pending migrations apply in one transaction. A late failure rolls back earlier pending files; the ledger records nothing.
- The custom-migration boundary is the main footgun. A future author can put a `CREATE TABLE` in a custom file and watch the next `generate` try to create it again. The local `drizzle` skill states the boundary.
- `drizzle-kit check` still validates only journal/snapshot integrity. Agreement between `schema.ts` and the SQL is enforced by the generate-and-diff gate.

## References

- [Drizzle schema and migration notes](../../drizzle/README.md)
- [Foundation runbook](../foundation-runbook.md)
- [Threat model](../security/threat-model.md)
- [AgDR-0015 — UUIDv7 primary keys](AgDR-0015-primary-key-identifier-strategy.md)
