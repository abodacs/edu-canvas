# AgDR-0012 — Generated-pack publication records owned by #5

> In the context of issue #5 needing review, approval, and publication on `main` while #144's canonical record tables are not on `main`, I decided to add a generated-pack record slice named `pack_*`, to achieve a working publication path without replaying a 15k-line unmerged branch, accepting a temporary second record model that must be reconciled when #144 lands.

Recorded 2026-11-01 against `main` at `36ba6c8`. Parent contracts: [AgDR-0005](AgDR-0005-grounded-package-version-contracts.md), [AgDR-0011](AgDR-0011-versioned-record-storage.md) (on `impl/98-authentication` only).

## Decision

1. **#5 owns five additive tables**: `pack_versions`, `pack_approvals`, `pack_publications`, `pack_assignments`, and `pack_receipts`. They are tenant-scoped, RLS-forced, and append-only by trigger. A revision inserts a new version row; nothing updates or deletes.
2. **The generated pack is a version shape, not a curated one.** `pack_versions` stores the four public variants, the validated learning path, the accepted gate snapshot, the validation result, rule versions, provenance, and the private answer relationships. `lesson-package-generated-v1` is the schema version.
3. **Approval is a separate fact per target.** One row each for the four variants and one for the reverse-reasoning path, pinned to the version's artifact hash and validation-result hash. Warnings require explicit acknowledgement on the approval; a changed hash resets every approval.
4. **Publication is gated and idempotent.** Publish re-derives the gate from the stored revision, refuses a stale hash or a missing approval, writes one publication and one assignment, and replays through `pack_receipts` and unique keys.
5. **The public review projection never carries private answers.** The shared `reviewPackSchema` has no `relationships`, `privateAnswers`, or answer-key field; the payload scrub test fails if one appears.

## Alternatives considered

- **Replay #144's records commit onto `main`.** Rejected by the owner: it adds ~15k lines of an unmerged branch and its migrations collide with main's `0006_far_viper`.
- **Reuse the curated `lesson_versions` shape.** Rejected: `curated_reference_id` is required and sections are four fixed stage kinds; a generated four-variant pack does not fit without pretending a prompt is a curated reference.
- **Write only `publications` and `assignments`.** Rejected: without an immutable version row there is nothing to approve or pin, and retries would duplicate content.
- **Use canonical `lesson_*` names now.** Deferred: it guarantees a migration collision when #144 lands; the `pack_*` names keep the reconciliation explicit.

## Consequences

- Two record models coexist until #144 merges. The reconciliation must migrate `pack_*` rows into the canonical tables and retire the #5 names in one migration.
- The semantic report is pinned in the version's gate snapshot; publish re-derives the structural gate and compares the artifact hash and policy version. A changed semantic report alone is not re-detected. This limit belongs to the #28 re-derivation seam, not to publication.
- The seeded demo tenant gained one learner actor and membership (`actor_learner_omar` / `learner_omar`) so an assignment has a real referent. The legacy demo identity row cannot be assigned.
- Fraction-pinned drafts stay outside this path; `buildInitialVersion` refuses a record without a lesson draft.

## Handoff

- Record port and adapters: `src/server/persistence/pack-port.ts`, `pack-seeded.ts`, `pack-postgres.ts`.
- Domain: `src/server/publication/contracts.ts` (version builder, edit and gate derivation), `service.ts` (open, approve, revise, publish, preview).
- Wire contract: `src/shared/publication-contract.ts`.
- Delivery: `src/server/publication/delivery.server.ts`, `src/routes/api/publications/**`.
- Surfaces: `src/components/studio/review-studio.tsx` and its gallery, editor, and confirmation children.
- Evidence: `service.test.ts`, `pack-database.test.ts`, `review-surfaces.test.ts`, policy rows PT-04/12/20/28/29/47.
