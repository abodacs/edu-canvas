# IC1 live run — 2026-10-27

**Status: IC1 path passes on the accepted diagnostic run.** One live Meta draft passed structural and semantic validation, persisted, projected safely, and rendered in the A2UI preview. The unsupported objective was rejected with no persisted artifact.

**Issue:** [#115](https://github.com/abodacs/edu-canvas/issues/115). **Revision:** `bfbdf9b571773948dd396e681942994c1a0d013b` plus the timeout, prompt-context, schema, and claim-lease changes in the working tree. **Run window:** 2026-10-26 22:19:30 UTC to 22:41 UTC. About 20 focused minutes for this rerun.

## Environment

| Field | Value |
| --- | --- |
| App | TanStack Start dev server, `http://localhost:3000/demo/teacher` |
| App mode | `DEMO_MODE=false` process override. The checked-in `.env` still says `DEMO_MODE=true`. |
| Persistence | PostgreSQL, Docker `postgres:17-alpine`, `postgres` adapter |
| Provider adapter | OpenAI-compatible Responses adapter |
| Endpoint | `https://api.meta.ai/v1` |
| Model | `muse-spark-1.2-contributor` |
| Timeout | `OPENAI_TIMEOUT_MS=100000` |
| Claim lease | 220 seconds |
| Eligibility | Meta endpoint and model access confirmed by a live call. Official event rules and the permitted-model list are not attached. |

## Input

| Field | Value |
| --- | --- |
| Prompt | `Explain equivalent fractions for Grade 4 in English. Match 1/2 with 2/4, 3/6, and 4/8.` |
| Grade | 4 |
| Standard | `standard_ccss_4_nf_a_01` (`4.NF.A.1`) |
| Language | `en` |
| Difficulty | `on-level` |
| Reference | `activity_version_demo_equivalent_fractions_v1`, version 1; graph `equivalent-fractions-v1`; standard `4.NF.A.1`; source `1/2`; public target options `2/4`, `3/6`, `4/8`, `2/3` |
| Reference provenance | CCSS `4.NF.A.1`; seed activity version in `src/server/seed-data.ts`. The model receives the reference content and version, not a URL. |

## Successful path

Primary request: `draft_req_c67590db-dc89-4f76-b52d-1b23304373b0`.

| Stage | Observed result | Evidence |
| --- | --- | --- |
| Generate | Live provider call returned a draft. UI showed generating then ready. | Screenshots 01–03 in `.scratch/ic1-2026-10-27/` |
| Structural | `ready-for-review`; 4 variants; 2 path steps. | DB read-back |
| Semantic | 5 warnings, 0 errors; `correction_attempted=true`. | Diagnostics below |
| Save | One request row and one attempt row. | DB read-back |
| Read back | Preview read the persisted row and streamed 4 surfaces. | Preview SSE check |
| Projection | Result keys only `requestId,state,attempt,diagnostics,draft,provenance,retry`; no `answerKey`, `relationships`, `tenantId`, `teacherId`, or `attempts` keys. | Idempotent replay check |
| Preview | 4 tabs; source `1/2` and target `2/4` selected; “Preview selection captured.” | Screenshots 04–06 in `.scratch/ic1-2026-10-27/` |

DB read-back:

```text
id             draft_req_c67590db-dc89-4f76-b52d-1b23304373b0
state          ready-for-review
attempt        1
standard_id    standard_ccss_4_nf_a_01
language       en
grade          4
provider       openai
model          muse-spark-1.2-contributor
prompt         lesson-prompt-v1
validator      lesson-validator-v2
variants       4
path_steps     2
created_at     2026-10-26 22:38:33.301+00
updated_at     2026-10-26 22:39:06.768+00
elapsed        33.467 s
```

Attempt row:

```text
request_id           draft_req_c67590db-dc89-4f76-b52d-1b23304373b0
attempt_number       1
idempotency_key      4f4f33fd-36fc-4ff8-a4f4-554e279e0aaf
state                ready-for-review
correction_attempted true
created_at           2026-10-26 22:38:33.302+00
```

Diagnostics:

| Code                                 | Severity | Count |
| ------------------------------------ | -------- | ----- |
| `VARIANT_NOT_MEANINGFULLY_DIFFERENT` | warning  | 3     |
| `SCAFFOLD_LEVEL_UNCLEAR`             | warning  | 1     |
| `CHALLENGE_LEVEL_UNCLEAR`            | warning  | 1     |

The correction pass was needed because the first live response returned empty hint arrays. The provider JSON schema now requires `hints` with `minItems: 1` and 1–3 non-empty strings. The corrected response passed structural validation.

## Projection and preview

- Idempotent replay returned the same request result without a new provider call.
- Result keys: `requestId`, `state`, `attempt`, `diagnostics`, `draft`, `provenance`, `retry`.
- No answer-key, relationship, tenant, teacher, or attempt keys in the public payload.
- Preview SSE: 23,400 bytes; `answerKey`, `correctTargets`, `relationships`, `tenantId`, and `teacherId` are absent.
- Preview URL: `http://localhost:3000/api/a2ui/preview?role=teacher&requestId=draft_req_c67590db-dc89-4f76-b52d-1b23304373b0&catalogVersion=matching-v1`.

## Unsupported path

Exact input sent through the same `/_serverFn/...` entry point:

```json
{
  "prompt": "Teach Grade 5 multi-digit multiplication.",
  "grade": "5",
  "standardId": "standard_ccss_5_nbt_b_05",
  "language": "en",
  "difficulty": "on-level"
}
```

Observed response: HTTP 200 server-function envelope with the explicit error:

```text
This learning objective is not supported. Use Grade 4 equivalent fractions (4.NF.A.1).
```

Before and after:

```text
accepted ready-for-review rows: 9 -> 9
total lesson_draft_requests:    14 -> 14
lesson_generation_attempts:     15 -> 15
rows with unsupported standard or Grade 5 prompt: 0
```

No accepted lesson, package, or preview was created. No existing accepted lesson was replaced. The app has no approval or publication boundary; that remains a later checkpoint.

## Code changes used by this run

| File | Change |
| --- | --- |
| `src/server/config.ts` | `OPENAI_TIMEOUT_MS` with default `100000` and bounds `1000–120000` |
| `src/server/generation/provider.ts` | Provider context carries approved graph nodes, edges, target, and curated reference; prompt includes them; JSON schema enforces hints and item counts; timeout is configurable |
| `src/server/generation/service.ts` | Builds provider context from the resolved curriculum context and seed reference; unsupported standard returns a specific message |
| `src/server/generation/draft-acceptance.ts` | Exports `resolveCurriculumContext` for the provider and validator |
| `src/server/generation/types.ts` | Claim lease raised to 220 seconds |
| `src/server/generation/generation-input-error.ts` | Error accepts a specific message |
| `.env.example`, `docs/foundation-runbook.md`, `docs/agdr/AgDR-0006...`, `docs/design/...` | 100-second event timeout and 220-second lease documented |

## Checks

```text
pnpm lint                                           pass
pnpm typecheck                                      pass
pnpm test                                           138 passed, 6 skipped
pnpm verify:architecture                            pass
pnpm verify:boundaries                              5 pre-existing warnings, 0 errors
pnpm exec vitest run config provider service gate persistence   57 passed
```

## Limits

- Official event eligibility and permitted-model evidence are not attached.
- The `.env` still has `DEMO_MODE=true`; the run used a process override.
- The GUI cannot send an unsupported standard. The rejection proof uses the same server-function entry point with a modified `standardId`.
- The reference provenance is the seed version and CCSS code, not a fetched URL.
- The #105 behavioral matrix for deadlines, cancellation, ownership, and idempotency is not complete. The 100-second timeout and 220-second lease are recorded, not fully proved.
- Approval, immutable publication, learner path, grading, and teacher override are out of IC1.

## Screenshots

Local artifacts only: `.scratch/ic1-2026-10-27/` (gitignored).

| File | What it shows |
| --- | --- |
| `01-prompt.png` | Prompt, Grade 4, `4.NF.A.1`, English |
| `02-generating.png` | Disabled “Shaping the draft…” state |
| `03-accepted.png` | `Ready to review`, 4 variants, warnings |
| `04-preview.png` | A2UI preview, 4 tabs, learning path |
| `05-source-selected.png` | Source `1/2` selected |
| `06-selection-complete.png` | `1/2` + `2/4` selected; “Preview selection captured” |
| `db-readback.txt` | Persisted request and attempt rows |
