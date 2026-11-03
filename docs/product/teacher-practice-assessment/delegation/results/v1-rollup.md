# Delegation pack v1 rollup

Rerun set: {s0-smoke} (three product fixes) + new ac-surface/ac-boundary-empty cases. v0 = the pre-fix tree at `65a13c8`. Run: 2026-11-03T17:56:08.724Z · application revision `508f7fec920e4d93057a8940aff1a2ea15a3a10d` · mode `full` · runner `scripts/eval-practices.ts`.

## Practices

| ID | Practice | Capability @ pin | Observed cases | Result | Gap owner |
| --- | --- | --- | --- | --- | --- |
| DG1 | Clarify the goal | partial | dg-1-challenge=2, dg-1-normal=2 | see cases | needs issue — owner Abdullah |
| DG2 | Consult on the approach | missing | no executed case | see cases | needs issue — owner Abdullah |
| DG3 | Recognize unsuitable tasks | missing | dg-3-challenge=1, dg-3-normal=1 | see cases | needs issue — owner Abdullah |
| DG4 | Consider strengths and limits | partial | dg-4-challenge=2, dg-4-normal=2 | see cases | needs issue — owner Abdullah |
| DG5 | Stay involved | partial | dg-5-challenge=2, dg-5-normal=2 | see cases | needs issue — owner Abdullah |
| DG6 | Choose a suitable tool or approach | partial | dg-6-challenge=2, dg-6-normal=2 | see cases | #113 / #114 |
| DG7 | Reassign work as it evolves | missing | no executed case | see cases | needs issue — owner Abdullah |

Capability labels come from the re-pinned rows in the pack README; they are not eval scores. Observed case scores: 2 fully meets, 1 partly meets, 0 fails.

## Cases

| Case | Practice | Layer | Status / score | Observed |
| --- | --- | --- | --- | --- |
| `ac-boundary-empty` | S0 | B-browser | 2 | Designed empty heading=true; result table present=false. |
| `ac-surface` | S0 | B-browser | 2 | All-results table present=true; provisional note=true; reason="The learner needs another supported example."; provenance="Rule next-activity-rule-591a157cd85e · evidence 88bd2951264664a7a70b9d44ee303f717006f832af3240db31d78dcb0899059f"; preview present=true. |
| `dg-1-challenge` | DG1 | A | 2 | service.ts:181-186 threw GENERATION_INPUT_INVALID status 422 with the curated Grade 4 message; the .strict() contract also rejected the extra successCriteria field, confirming goal criteria are not captured separately. |
| `dg-1-normal` | DG1 | A | 2 | lessonGenerationInputSchema rejected the input; zod issues name standardId. The delivery seam maps a parse failure to IdentityError INVALID_INPUT, status 422 (src/server/identity/errors.ts:26). No record is created and no provider call is possible. |
| `dg-2-challenge` | DG2 | B-det | blocked-feature | The required workflow does not exist at the pinned revision; absence evidence is the recorded grep in the pack README. Flip: Unblocks when an approach-comparison stage exists in the generation workflow and a chosen approach can be recorded and honored. |
| `dg-2-normal` | DG2 | B-det | blocked-feature | The required workflow does not exist at the pinned revision; absence evidence is the recorded grep in the pack README. Flip: Unblocks when an approach-comparison stage exists in the generation workflow (options plus tradeoffs plus wait-for-choice before drafting). |
| `dg-3-challenge` | DG3 | A | 1 | Boundary half holds: checkPrompt blocked the request with category personal-data and code MODERATION_BLOCKED before any provider call (a prompt block makes zero provider calls per the service conformance suite). Capability half (teacher-judgment handback with bounded help) stays a GAP, so the score is capped at 1. |
| `dg-3-normal` | DG3 | A | 1 | Boundary half holds: the unsuitable task was rejected GENERATION_INPUT_INVALID 422 before any draft. Capability half stays a GAP: no handback interaction exists at 1a8c94e (grep evidence in the pack README), so the score is capped at 1 and the practice result stays missing. |
| `dg-4-challenge` | DG4 | A | 2 | reviewLearningQuality returned hard_block with READING_LEVEL_TOO_COMPLEX (warning, field instructions, recommendation present) and UNSAFE_CLAIM (hard block) — the app names what to double-check without claiming verification. |
| `dg-4-normal` | DG4 | A | 2 | reviewLearningQuality (learning-quality-validator.ts:295) returned verdict pass with no warning or hard_block findings on the strong draft. The validator claims no verification of reading level or pedagogy, matching the partial capability. |
| `dg-5-challenge` | DG5 | B-browser | 2 | Recovery panel rendered (#revise-request present=true); retry-style control present=false; publish control present=false. |
| `dg-5-normal` | DG5 | B-live | 2 | 4 variant cards rendered; titles observed: ["Equivalent fractions matching - standard 1","Equivalent fractions matching - standard 2","Equivalent fractions matching - scaffold","Equivalent fractions matching - challenge"]; distinct titles: 4; teacher checked the first card and opened review. |
| `dg-6-challenge` | DG6 | B-det | 2 | Decision rules held: the drifted retry was refused RETRY_METADATA_MISMATCH 409 and the ready-for-review retry was refused DRAFT_NOT_RETRYABLE 409; the record stayed at state ready-for-review attempt 1. |
| `dg-6-normal` | DG6 | B-det | 2 | Real PostgreSQL persistence plus the deterministic fixture provider: the first attempt settled failed-retryable with retry available; the retry (retryOfRequestId set) advanced the same record to ready-for-review at attempt 2 with 2 recorded attempts and a four-variant draft. |
| `dg-7-challenge` | DG7 | B-det | blocked-feature | The required workflow does not exist at the pinned revision; absence evidence is the recorded grep in the pack README. Flip: Unblocks when a stop or continuation-prevention control exists in the studio or review workflow. |
| `dg-7-normal` | DG7 | B-det | blocked-feature | The required workflow does not exist at the pinned revision; absence evidence is the recorded grep in the pack README. Flip: Unblocks when a section handback control exists in the studio or review workflow. |
| `s0-smoke` | S0 | B-browser | 2 | All steps completed. Publish outcome=linked (/learn?assignment=01a1a28d-4f95-7e72-b322-45f5752727c3&variant=variant_standard_01). Attempt submitted (1 of 3 matched.); board 3 sources / 3 targets. |

None of the statuses above is a pass by itself.

## #8 acceptance map (issue #8, all 7 ACs)

| AC | Claim | Case id / evidence |
| --- | --- | --- |
| 1 completed submission after refresh, history immutable | ac-surface (read side) + progress-database suite (storage side) | results/s0/s0-16-ac-surface.png; src/server/persistence/progress-database.test.ts |
| 2 displayed reason matches the deterministic decision | replayNextActivity suite (AC2 row) | src/server/persistence/progress-database.test.ts (replay diff) |
| 3 no unrelated student or tenant data | ac-boundary-empty + progress-database tenant rows | results/s0/s0-16-ac-empty.png |
| 4 read-only preview link | ac-surface (`.progress-preview`) | results/s0/s0-16-ac-surface.png |
| 5 reason explains routing | ac-surface (`.progress-purpose` + reason verbatim) | results/s0/s0-16-ac-surface.png |
| 6 designed non-happy states | dashboard-surfaces suites (loading/empty/permission/missing/error) + ac-boundary-empty (live empty) | src/components/dashboard/dashboard-surfaces.test.ts |
| 7 boundary/no-data/error/reason test coverage | pnpm check suites + this pack's deterministic subset | results/v1.json |

AC7 note: unit-test counts alone score nothing per the pack method; the live surface rows above carry the browser traces.
