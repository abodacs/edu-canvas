# Homonym register

Every word below names two different work objects. Each entry records both implementations, the resolution, and whether the code changes.

Resolution rule: **rename the code when one context holds both meanings; split the term when the contexts are separate.** A split is not a lesser fix — it is what a bounded context is for. A rename that crosses a published contract or a migration needs its own reason, listed per entry.

| # | Word | Meaning A | Meaning B | Same context? | Resolution |
| --- | --- | --- | --- | --- | --- |
| 1 | assignment | **Class assignment** — teacher ↔ class (`class_assignments`) | **Learner assignment** — publication ↔ learner (`assignments`) | no | split term, keep both tables |
| 2 | attempt | **Generation attempt** (`lesson_generation_attempts`) | **Learner attempt** (`learner_attempts`) | no | split term; tables already qualified |
| 3 | version | **Pack version** (`pack_versions`) | **Lesson version** (`lesson_versions`) | no | split term; tables already qualified |
| 4 | publication | **Pack publication** (`pack_publications`) | **Record publication** (`publications`) | **yes** — `src/server/publication/` | **rename in code** |
| 5 | source | **Source material** — an uploaded document (`source_snapshots`) | **Source item** — the left column of a matching activity (`role: "source"`) | no | split term; catalog value stays |
| 6 | standard | **Curriculum standard** (`standards`, `standardId`) | **Standard variant** — the baseline of three content variants (`kind: "standard"`) | **yes** — `generation/types.ts` | split term; see note |
| 7 | target | **Target item** (`role: "target"`) | **Target concept** (`nextActivity.targetId`) | yes for A and C | split term; see note |
| 8 | lesson | **Lesson draft** — the generated draft (`lesson_draft_requests`) | **Lesson version** — the stored revision (`lesson_versions`) | no | split term |
| 9 | review | **Draft review** — the teacher checks the lesson | **Source review** — the teacher checks extracted text | yes, in the teacher's day | split term |
| 10 | evidence | **Research evidence** — a source that makes a claim checkable | **Learning evidence** — the learner work a teacher inspects (`teacher_evidence`) | no | split term |

## Entry 4 — the only code rename

`src/server/publication/` holds both meanings:

- `service.ts:236` — `const publication = await packs.readPublicationForVersion(...)` → a **pack** row.
- `record-bridge.ts:212` — `const publication = await records.publish(...)` → a **record** row.

Two variables, same name, one context, different tables. That is the case a glossary cannot fix. Both are renamed: `packPublication` and `recordPublication`. No migration, no contract change.

## Entry 6 — why the variant kind keeps its name

`kind: "standard"` lives in `variantKindValues`, which is published in `src/shared/generation-contract.ts` and accepted by the A2UI contract. Renaming it would change a wire format for a vocabulary problem. The glossary separates **Standard variant** from **Curriculum standard**, and prose must say which. Recorded as accepted vocabulary debt.

## Entry 7 — the field that would need a migration

`nextActivity.targetId` names a **concept node**, not a target item. The honest name is `conceptId`. Changing it is a data migration over a `jsonb` column plus an API change. Not done here: no current reader confuses the two, because only the next-activity projection reads it. Listed as debt.

## Where each word now lives

| Word | Owning glossary |
| --- | --- |
| Class assignment | [identity](../../src/server/identity/GLOSSARY.md) |
| Learner assignment, Learner attempt, Lesson version, Record publication, Target item, Target concept, Learning evidence | [records](../../src/server/records/GLOSSARY.md) |
| Generation attempt, Lesson draft, Standard variant, Source item | [drafting](../../src/server/generation/GLOSSARY.md) |
| Pack version, Pack publication, Approval target | [publication](../../src/server/publication/GLOSSARY.md) |
| Source material, Source review | [curriculum](../../src/server/grounding/GLOSSARY.md) |
| Curriculum standard | [product language](../../GLOSSARY.md) |
| Draft review | [drafting](../../src/server/generation/GLOSSARY.md) |
| Research evidence | [product language](../../GLOSSARY.md) |

## Check

`pnpm verify:glossary-coverage` fails when a table or a stored-record schema is claimed by no term, or by two. It cannot detect a homonym. This register is the only guard, so a new word with two meanings is a review finding here, not a test failure.
