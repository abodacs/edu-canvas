# AgDR-0011 — Versioned lesson records and actor-scoped receipts

> In the context of the focused event needing restart-safe approval, assignment, learner evidence, and teacher choice ([#112](https://github.com/abodacs/edu-canvas/issues/112)) while the demo activity tables are fixtures with no production writer, I decided to give the production loop its own immutable record model, its own persistence port, and a versioned public-lesson projection, to achieve one owner per record and migrations that never bend to demo constraints, accepting a second attempt table and a projection function whose changes are version-pinned.

Recorded 2026-10-28 against `impl/98-authentication` with `main` merged. Parent contracts: [AgDR-0005](AgDR-0005-grounded-package-version-contracts.md), [AgDR-0015 (identifiers)](AgDR-0015-primary-key-identifier-strategy.md), [AgDR-0010](AgDR-0010-drizzle-migration-ownership.md).

## Decision

1. **One production content model**: `lesson_packages` → immutable `lesson_versions` → `publications`. Approval is a separate fact; it never mutates a version.
2. **The learner view is derived, not stored**. `projectPublicLesson` dispatches on the version's `schemaVersion` and `ruleVersions.projectionVersion`; the read recomputes the projection and checks it against `publications.contentHash`. The demo `activities`/`activity_versions` tables receive no DDL and no production writes.
3. **Learner attempts live in `learner_attempts`**. Extending the demo `attempts` table would have required relaxing its `activity_version_id` NOT NULL and fabricating activity versions. Legacy `attempts` stays read-only fixture data.
4. **Records are a separate persistence port**, like identity. `createRecordPersistence` returns a `RecordPersistence` built from one shared command layer over three backends (seeded, raw SQL, Drizzle). `FoundationPersistence` and generation state are untouched.
5. **Actor-scoped receipts**. Every write stores `(tenantId, actorId, action, operationKey)` with an input hash and result ids. A replay reauthorizes the actor, membership, session, and revision before returning the stored ids. Domain records store the stable `actorId`; learners are the tenant-local `identities` row.
6. **Focused-slice scope**. Ten tables: curated references, packages, versions, publications, assignments, runs, assistance events, learner attempts, teacher decisions, operation receipts. Source snapshots, match decisions, invalidations, and generation outcomes stay with #113/#106/#132.
7. **Migrations stay generated**. Tables, columns, constraints, indexes, and policies come from `drizzle/schema.ts` and `pnpm db:generate`. Only forced RLS and the append-only triggers use `generate --custom`.

## Alternatives considered

- **Project each publication into `activities`/`activity_versions`** so attempts keep the legacy foreign key. Rejected: duplicates public and private content, creates two owners, and requires fabricating legacy activity rows.
- **A generic `records(type, payload JSONB)` table.** Rejected: loses composite tenant foreign keys, per-table immutability, and unique constraints; the referent sweep would become application-only.
- **An event log with replay.** Rejected: makes replay and upcasting part of ordinary reads.
- **Extend the demo `attempts` table.** Rejected: the NOT NULL activity-version binding and the demo trigger would shape production evidence.
- **RLS as the only authorization.** Rejected: RLS returns empty rows and cannot distinguish FORBIDDEN from NOT_FOUND; the application seam carries the typed denial.

## Consequences

- Legacy readers and fixtures survive by construction: the migration adds tables only.
- Two attempt tables exist; the legacy one is documented as demo-only.
- A projection change is a versioned decision; old versions keep their old projection.
- Receipts make retries safe but add one row per committed write.
- The deferred grounding, matching, and moderation records add tables in their own migrations.

## Handoff

- Record contracts: `src/server/records/`.
- Command layer and port: `src/server/persistence/records-commands.ts`, `records-port.ts`.
- Adapters: `records-seeded.ts`, `records-postgres.ts`, `records-drizzle.ts`.
- Evidence: `records-*.test.ts` (focused loop, policy matrix, referents, DB parity, restart probe) plus `scripts/records-restart-probe.ts`.
