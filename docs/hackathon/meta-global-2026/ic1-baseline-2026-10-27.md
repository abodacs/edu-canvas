# IC1 baseline — 2026-10-27

**Issue:** [#117](https://github.com/abodacs/edu-canvas/issues/117). **Purpose:** one revision-pinned IC1 inventory and prerequisite record. It states what works, what is missing, what is unverified, and the next executable proof. **Revision:** `bfbdf9b571773948dd396e681942994c1a0d013b` plus the uncommitted timeout, prompt-context, schema, and claim-lease changes recorded in [the live run](evidence/ic1-2026-10-27/README.md). **Date:** 2026-10-27.

**2026-10-30 update:** the next-executable proofs below item 6 were executed against the #143 identity seams — see [the 2026-10-30 re-trace](evidence/ic1-2026-10-30/README.md) (two live `muse-spark-1.2-contributor` traces, explicit unsupported rejection, and the three fresh-database blockers fixed). Eligibility evidence is attached there; teacher content review and the keyboard-only check remain open and carry forward into the new record.

## Inventory

| IC1 step | Status | Observed check | Limit and next proof |
| --- | --- | --- | --- |
| Request entry and live/fixture selection | **Working** | `/api/readiness` reported `demoMode:false`, `persistence:postgres`, `provider.timeoutMs:100000`. Teacher form called the `/_serverFn/...` entry point. | Only the teacher role is tested. Next: repeat the role boundary check after the revision is pinned. |
| Supported-objective boundary | **Working** | Unsupported `standard_ccss_5_nbt_b_05` returned `This learning objective is not supported. Use Grade 4 equivalent fractions (4.NF.A.1).` No rows were created. | The GUI always sends the supported standard. The replay uses the same entry point. Record this limit. |
| Curated reference and provenance | **Partial** | Provider prompt carried `activity_version_demo_equivalent_fractions_v1` version 1, graph `equivalent-fractions-v1`, standard `4.NF.A.1`, source `1/2`, and public target options. | Provenance is the CCSS code and seed version, not a fetched URL. Next: attach the source record or accept the limit. |
| Provider selection, access, bounded generation | **Working with contract change** | `muse-spark-1.2-contributor` at `https://api.meta.ai/v1` returned an accepted draft in 33.467 s. Timeout is 100 s; claim lease is 220 s. | Official event eligibility is not attached. #105 is not complete. Next: record eligibility and run the #105 matrix. |
| Structural validation | **Working** | Accepted draft has 4 variants and 2 approved path steps. The first live response had empty hint arrays; the JSON schema now requires 1–3 hints, and the correction pass succeeded. | One correction was used. Next: test a first-pass valid response and a two-invalid-response path. |
| Semantic validation | **Working with warnings** | 5 warnings, 0 errors: 3 × `VARIANT_NOT_MEANINGFULLY_DIFFERENT`, `SCAFFOLD_LEVEL_UNCLEAR`, `CHALLENGE_LEVEL_UNCLEAR`. | No teacher content review. Validator coverage of mathematical and pedagogical quality is unverified. |
| Persistence and reload | **Working** | Request `draft_req_c67590db-dc89-4f76-b52d-1b23304373b0` persisted with `ready-for-review`; attempt row recorded; preview read it back. | No database restart or concurrent-read test. Next: add to #105 if required. |
| Safe public projection | **Working** | Public result keys are only `requestId,state,attempt,diagnostics,draft,provenance,retry`. No answer-key, relationship, tenant, teacher, or attempt keys. Preview SSE 23,400 bytes with no forbidden fields. | `draft` still contains `sourceItems`, `targetItems`, `distractorItems`, hints, and feedback, which the teacher preview uses. Record the permitted-field list. |
| Existing A2UI preview and interaction | **Working** | 4 tabs rendered. Source `1/2` and target `2/4` selected. Status showed “Preview selection captured.” | Keyboard-only and narrow-viewport checks are unverified. |

## First failing or unavailable check

Within the IC1 path, no check failed on this run. The **first unavailable prerequisite** is official event eligibility and permitted-model evidence (V1). The **next unverified contract** is the #105 behavioral matrix for deadlines, idempotency, cancellation, and ownership.

The last passing check is the preview source/target interaction. The next unverified prerequisite is the #105 matrix, followed by human content/pedagogy review.

## Verification map

| Area | Named check | Rules or rubric | Tested artifact | Owner | Observed result | Limit |
| --- | --- | --- | --- | --- | --- | --- |
| Content | `pnpm verify:lesson-gate`; semantic validator | Structural draft/path properties; curriculum and learning-quality rules | Request `draft_req_c67590db-dc89-4f76-b52d-1b23304373b0` | Builder | 4 variants, 2 path steps, 5 warnings, 0 errors | No mathematical or pedagogical quality review |
| Pedagogy | None supplied | None supplied | Draft review is pending | Abdullah + teacher reviewer | Unverified | A teacher must review the scaffold, challenge, hints, and feedback |
| Rendering | A2UI preview | Existing catalog `matching-v1` | Screenshots `04-preview.png`, `05-source-selected.png`, `06-selection-complete.png` in `.scratch/ic1-2026-10-27/` | Builder | 4 tabs rendered; selection worked | No external visual reviewer |
| Interaction | Source/target selection | Existing preview interaction | Same screenshots | Builder | “Preview selection captured” | Keyboard-only and phone viewport are unverified |

## Prerequisites

| Prerequisite | Status | Evidence or gap |
| --- | --- | --- |
| Model access | **Confirmed fact** | Live `muse-spark-1.2-contributor` response on `https://api.meta.ai/v1`; accepted draft in 33.467 s. |
| Eligibility and reuse | **Explicit unknown** | Official rules, permitted-model list, registration, and existing-code reuse evidence are not attached. |
| Capacity | **Explicit unknown** | 30 + 6 hours remain provisional. The five-hour IC1 limit was not exceeded on this rerun. |
| Scope and verification authorization | **Partial** | Focused scope exists. No content/pedagogy verification skill or rubric is supplied. |
| Reference provenance | **Partial** | CCSS `4.NF.A.1` and seed activity version 1. No fetched source URL. |

## Next executable proof

1. Pin the revision and start from a clean tree.
2. Run the #105 matrix for 100-second calls, 220-second lease, idempotency conflict, cancellation, and late writes.
3. Attach official eligibility and permitted-model evidence.
4. Run one teacher content review of the scaffold, challenge, hints, and feedback.
5. Run keyboard-only and narrow-viewport preview checks.
6. Re-run the supported and unsupported paths and replace this baseline only when the revision and evidence agree.

## Time and fallback

- Focused run time for this rerun: about 20 minutes.
- IC1 deadline: five focused hours. Not exceeded.
- Fallback trigger: not reached. Cut 2 or Kill is not active.
- Do not count the earlier fixture or diagnostic runs as live success.
