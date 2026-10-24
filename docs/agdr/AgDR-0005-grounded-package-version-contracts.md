# AgDR-0005 — Grounded lesson-package and version contracts

> In the context of expanding the validated generation slice into the full agreed teacher workflow, facing the risk that grounding evidence, lesson content, and approvals drift between unversioned shapes that cannot be audited or rolled back, I decided to define grounded package and version contracts — an immutable source snapshot, a versioned `lesson-package-v2`, a `fractions-v2` catalog extension, and immutable publication/approval records with explicit schema versions — to achieve a provenance-complete, rollback-safe lesson pipeline, accepting additive storage growth and that legacy records keep an explicit legacy schema version without inferred provenance.

Recorded 2026-10-25 for the hackathon-2026 reconciliation ([#89](https://github.com/abodacs/edu-canvas/issues/89)). Normative contracts live in the [implementation document](../design/design-doc-implementation.md); this record explains the decision.

## Context

The current `ProviderLessonDraft` carries exactly four matching variants and no `concepts` field, no source provenance, and no schema version. The agreed release adds Learning Commons grounding, uploads, section revision, publication, attempts, and teacher decisions. Without versioned contracts, a grounded draft could not prove which evidence produced it, a revision could silently change approved content, and an additive schema change could reinterpret old records.

## Decision

Grounding enters the pipeline as an immutable `SourceSnapshot` (`learning-commons` or `upload` mode) with standard, required skills, prerequisites, bounded sources, gaps, retrieval time, and content hash. A snapshot never changes after generation starts; a correction creates a new snapshot.

Lesson content is a versioned `lesson-package-v2`: the four existing matching variants are retained as content options, and a separate ordered sequence (`worked-example`, `guided-practice`, `independent-check`, `follow-up`) carries typed section data — never executable markup. Each package version records `schemaVersion`, `snapshotId`, `matchDecisionId`, `conceptIds`, and `parentVersionId`. External source IDs stay distinct from local graph-node IDs.

Publication, attempts, and teacher decisions are immutable after creation and pin the exact content and validation-result hashes and rule versions. A section revision copies unedited sections, revalidates the whole package, and creates a new draft version; a published version never returns to draft. The `fractions-v2` catalog (A2UI `v0.9.1`) adds `MathText` and `FractionDiagram` as explicit bounded components instead of widening `matching-v1`.

All new JSON schemas reject unknown properties; private schemas stay in server modules. Legacy records receive an explicit legacy schema version and no inferred approval or source provenance. Deploy readers before writers; disable features until acceptance checks pass.

## Consequences

- Every generated lesson is auditable back to evidence, match decision, and rule versions.
- Revisions and re-approvals cannot mutate what a learner already runs against.
- Additive migrations only; rollback preserves saved versions and attempts and never deletes attempt records.
- The four variants stay content options inside one teaching sequence, not teaching stages.

## Handoff

The [implementation contracts](../design/design-doc-implementation.md#define-records-before-wiring-providers) define the record fields and transitions; AC01–AC24 verify them. [AgDR-0002](AgDR-0002-server-authoritative-grading.md) still owns grading. This decision does not authorize implementation; the [UI gate](../product/teacher-ui.md#implementation-gate) applies.
