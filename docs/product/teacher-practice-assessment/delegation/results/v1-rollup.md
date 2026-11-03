# Delegation pack v1 rollup

Rerun set: {s0-smoke}. v0 recorded the pre-fix tree at `65a13c8`; this v1 reruns the affected row after the three fixes below. Run: 2026-11-03T17:41:59.653Z · application revision `50820341907f189c5b005514deb54665c56f68f2` · mode `full` · runner `scripts/eval-practices.ts`.

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
| `dg-1-challenge` | DG1 | A | 2 | service.ts:181-186 threw GENERATION_INPUT_INVALID status 422 with the curated Grade 4 message; the .strict() contract also rejected the extra successCriteria field, confirming goal criteria are not captured separately. |
| `dg-1-normal` | DG1 | A | 2 | lessonGenerationInputSchema rejected the input; zod issues name standardId. The delivery seam maps a parse failure to IdentityError INVALID_INPUT, status 422 (src/server/identity/errors.ts:26). No record is created and no provider call is possible. |
| `dg-2-challenge` | DG2 | B-det | blocked-feature | The required workflow does not exist at the pinned revision; absence evidence is the recorded grep in the pack README. Flip: Unblocks when an approach-comparison stage exists in the generation workflow and a chosen approach can be recorded and honored. |
| `dg-2-normal` | DG2 | B-det | blocked-feature | The required workflow does not exist at the pinned revision; absence evidence is the recorded grep in the pack README. Flip: Unblocks when an approach-comparison stage exists in the generation workflow (options plus tradeoffs plus wait-for-choice before drafting). |
| `dg-3-challenge` | DG3 | A | 1 | Boundary half holds: checkPrompt blocked the request with category personal-data and code MODERATION_BLOCKED before any provider call (a prompt block makes zero provider calls per the service conformance suite). Capability half (teacher-judgment handback with bounded help) stays a GAP, so the score is capped at 1. |
| `dg-3-normal` | DG3 | A | 1 | Boundary half holds: the unsuitable task was rejected GENERATION_INPUT_INVALID 422 before any draft. Capability half stays a GAP: no handback interaction exists at 1a8c94e (grep evidence in the pack README), so the score is capped at 1 and the practice result stays missing. |
| `dg-4-challenge` | DG4 | A | 2 | reviewLearningQuality returned hard_block with READING_LEVEL_TOO_COMPLEX (warning, field instructions, recommendation present) and UNSAFE_CLAIM (hard block) — the app names what to double-check without claiming verification. |
| `dg-4-normal` | DG4 | A | 2 | reviewLearningQuality (learning-quality-validator.ts:295) returned verdict pass with no warning or hard_block findings on the strong draft. The validator claims no verification of reading level or pedagogy, matching the partial capability. |
| `dg-5-challenge` | DG5 | B-browser | 2 | Recovery panel rendered (#revise-request present=true); retry-style control present=false; publish control present=false. |
| `dg-5-normal` | DG5 | B-live | 2 | 4 variant cards rendered; titles observed: ["Standard Matching A","Standard Matching B","Scaffold Matching","Challenge Matching"]; distinct titles: 4; teacher checked the first card and opened review. |
| `dg-6-challenge` | DG6 | B-det | 2 | Decision rules held: the drifted retry was refused RETRY_METADATA_MISMATCH 409 and the ready-for-review retry was refused DRAFT_NOT_RETRYABLE 409; the record stayed at state ready-for-review attempt 1. |
| `dg-6-normal` | DG6 | B-det | 2 | Real PostgreSQL persistence plus the deterministic fixture provider: the first attempt settled failed-retryable with retry available; the retry (retryOfRequestId set) advanced the same record to ready-for-review at attempt 2 with 2 recorded attempts and a four-variant draft. |
| `dg-7-challenge` | DG7 | B-det | blocked-feature | The required workflow does not exist at the pinned revision; absence evidence is the recorded grep in the pack README. Flip: Unblocks when a stop or continuation-prevention control exists in the studio or review workflow. |
| `dg-7-normal` | DG7 | B-det | blocked-feature | The required workflow does not exist at the pinned revision; absence evidence is the recorded grep in the pack README. Flip: Unblocks when a section handback control exists in the studio or review workflow. |
| `s0-smoke` | S0 | B-browser | 2 | All steps completed. Publish outcome=linked (/learn?assignment=01a1a27f-feac-7f79-a0dd-67f53f47d5d7&variant=variant_standard_01). Attempt submitted (1 of 3 matched.); board 3 sources / 3 targets. |

None of the statuses above is a pass by itself.
