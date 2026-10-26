# IC1 diagnostic run — 2026-10-26

**Status: diagnostic, not IC1 acceptance.** The successful live run used a temporary 90-second provider timeout. The committed adapter timeout is 15 seconds, and every live Meta attempt exceeded it. Do not report this run as a passed IC1 gate.

**Issue:** [#115](https://github.com/abodacs/edu-canvas/issues/115). **Revision:** `bfbdf9b571773948dd396e681942994c1a0d013b`, plus a temporary provider-prompt fix. The prompt fix and the 90-second timeout were both reverted after the run. **Window:** started 2026-10-26 21:01:58 UTC; primary accepted result 21:24:54 UTC. About 23 minutes of focused run time, including provider fallbacks.

## Environment

| Field | Value |
| --- | --- |
| App | TanStack Start dev server, `http://localhost:3000/demo/teacher` |
| App mode | `DEMO_MODE=false` process override (the checked-in `.env` still says `DEMO_MODE=true`) |
| Persistence | PostgreSQL, Docker `postgres:17-alpine`, `postgres` adapter |
| Provider adapter | `openai` Responses API adapter |
| Endpoint host | `api.commandcode.ai` (`OPENAI_BASE_URL`), key not recorded |
| Model | `meta/muse-spark-1.1` |
| Eligibility | Model access works. Official event permission and rules evidence are **not attached**. |

## Input

| Field | Value |
| --- | --- |
| Prompt | `Explain equivalent fractions for Grade 4 in English. Match 1/2 with 2/4, 3/6, and 4/8.` |
| Grade | 4 |
| Standard | `standard_ccss_4_nf_a_01` (`4.NF.A.1`) |
| Language | `en` |
| Difficulty | `on-level` |
| Reference | `activity_version_demo_equivalent_fractions_v1`; graph `equivalent-fractions-v1`; CCSS `4.NF.A.1` |
| Reference limit | The request has no reference field. The provider receives the standard and approved graph node IDs, not the curated reference document. |

## Successful path

Primary request: `draft_req_c370e21e-7249-44f2-973e-43890285e4f3`.

| Stage | Observed result | Evidence |
| --- | --- | --- |
| Generate | HTTP server-function call completed; UI showed generating then ready. | [01](01-prompt-live-meta.png), [02](02-generating.png), [05](05-live-draft-accepted.png) |
| Structural | `state=ready-for-review`; 4 variants; 2 path steps. | DB row below |
| Semantic | 5 warnings, 0 errors; `correction_attempted=false`. | Diagnostics below |
| Save | One request row and one attempt row; no correction call. | DB row below |
| Read back | Preview endpoint read the persisted row and streamed 4 surfaces. | SSE check below |
| Projection | Top-level keys only `requestId,state,attempt,diagnostics,draft,provenance,retry`; no `answerKey`, `relationships`, `tenantId`, `teacherId`, or `attempts` keys. | Serialized payload check |
| Preview | 4 tabs; source `1/2` and target `2/4` selected; status “Preview selection captured.” | [06](06-preview-rendered.png), [07](07-preview-source-selected.png), [08](08-preview-selection-complete.png) |

Persistence read-back:

```text
id             draft_req_c370e21e-7249-44f2-973e-43890285e4f3
state          ready-for-review
attempt        1
standard_id    standard_ccss_4_nf_a_01
language       en
grade          4
provider       openai
model          meta/muse-spark-1.1
prompt         lesson-prompt-v1
validator      lesson-validator-v2
variants       4
path_steps     2
created_at     2026-10-26 21:24:34.116+00
updated_at     2026-10-26 21:24:54.785+00
elapsed        20.669 s
```

Attempt row:

```text
request_id           draft_req_c370e21e-7249-44f2-973e-43890285e4f3
attempt_number       1
idempotency_key      7e6416a9-439e-4a36-9ffa-37580d23ff87
state                ready-for-review
correction_attempted false
created_at           2026-10-26 21:24:34.117+00
```

Diagnostics:

| Code                                 | Severity | Count |
| ------------------------------------ | -------- | ----- |
| `VARIANT_NOT_MEANINGFULLY_DIFFERENT` | warning  | 3     |
| `SCAFFOLD_LEVEL_UNCLEAR`             | warning  | 1     |
| `CHALLENGE_LEVEL_UNCLEAR`            | warning  | 1     |

Preview SSE:

```text
GET /api/a2ui/preview?role=teacher&requestId=draft_req_c370e21e-7249-44f2-973e-43890285e4f3&catalogVersion=matching-v1
answerKey=absent  correctTargets=absent  relationships=absent  tenantId=absent  teacherId=absent
```

Public payload check: 18,648 bytes; result keys are the seven allowed keys above. The word “relationships” appears only inside a diagnostic `field` and recommendation text, never as an object key.

There is no separate operation ID. The chain uses `request_id` + `idempotency_key` + `attempt_number`.

## Unsupported path

Exact input sent through the same `/_serverFn/...` entry point:

```json
{
  "prompt": "Teach Grade 5 multi-digit multiplication.",
  "grade": "5",
  "standardId": "standard_ccss_5_nbt_b_05",
  "language": "en",
  "difficulty": "on-level",
  "idempotencyKey": "f42b0d63-9062-4500-a4be-1fd2c88d103c"
}
```

Observed response: HTTP 200 server-function envelope with the explicit error `Generation input is invalid.` The service rejects the unsupported standard before any provider call or persistence.

Before and after:

```text
accepted ready-for-review rows: 8 -> 8
total lesson_draft_requests:    11 -> 11
lesson_generation_attempts:     12 -> 12
rows with unsupported standard or Grade 5 prompt: 0
```

No new accepted preview was created. No existing accepted lesson was replaced. The app has no approval or publication boundary; that limit remains recorded.

## Checks

- `pnpm exec vitest run provider.test.ts service.test.ts lesson-gate-properties.test.ts` → 35 passed (with the temporary prompt fix).
- `pnpm typecheck` → pass.
- `pnpm verify:architecture` → pass.
- `pnpm verify:boundaries` → 5 pre-existing warnings, 0 errors after the fix was reverted.
- `pnpm exec eslint src/server/generation/provider.ts` → pass.

## Deviations and limits

- **Timeout:** the successful run used a temporary 90-second `AbortSignal.timeout`. The committed adapter uses 15 seconds. The fastest successful live request took 20.669 seconds; a second live request took 31.770 seconds; an outside-GUI probe took 26.640 seconds. All exceed 15 seconds and the AgDR-0006 contract of 10 seconds per call and 25 seconds total.
- **Prompt fix:** the successful run used a temporary prompt change, reverted after the run. It supplied the approved graph node IDs, screen-purpose IDs, edge, target, and a 3-source/3-target/0-distractor shape. Without it, a live Meta draft was blocked for using nodes, edges, and screen purposes outside the approved graph. The first implementation created a provider/contract dependency cycle, so it needs a proper design before it can stay.
- **Model eligibility:** `meta/muse-spark-1.1` is a Meta-branded model, but the run used a third-party gateway. Official event rules, permitted-model list, and account eligibility are not attached.
- **Earlier attempts:** two requests with `deepseek/deepseek-v4.1-flash` timed out at the committed 15-second abort. A Meta 1.3 attempt was blocked by validation before the prompt fix. These are diagnostic failures, not acceptance evidence.
- **Quality:** the accepted draft has five semantic warnings. The scaffold and challenge variants were flagged as not meaningfully different.
- **Reference:** the model is not grounded on the curated reference document.
- **Error clarity:** the unsupported response is a generic server-function error, not teacher-facing clarification.
- **Publication:** absent. No approval or package publication was tested.

## Screenshots

Local artifacts only: `.scratch/ic1-2026-10-26/` (gitignored).

| File | What it shows |
| --- | --- |
| `01-prompt-live-meta.png` | Prompt, Grade 4, `4.NF.A.1`, English, Create lesson |
| `02-generating.png` | Disabled “Shaping the draft…” state |
| `03-provider-timeout.png` | 15-second timeout at the committed adapter setting |
| `04-live-draft-blocked-validation.png` | Live draft blocked for unapproved graph references |
| `05-live-draft-accepted.png` | `Ready to review`, 4 variants, warnings |
| `06-preview-rendered.png` | A2UI preview, 4 tabs, learning path |
| `07-preview-source-selected.png` | Source `1/2` selected |
| `08-preview-selection-complete.png` | `1/2` + `2/4` selected; “Preview selection captured” |

## Reproduction

The checked-in revision needs the prompt fix and a longer timeout to repeat the successful path; both were reverted. Do not treat the result as IC1 acceptance until the timeout/contract decision and event eligibility are recorded.

```bash
docker compose up -d postgres
export DATABASE_URL=postgresql://edu_canvas:edu_canvas_dev@127.0.0.1:5432/edu_canvas
pnpm db:migrate && pnpm db:seed
set -a; . ./.env; set +a
OPENAI_MODEL=meta/muse-spark-1.1 DEMO_MODE=false pnpm dev
```

Open `http://localhost:3000/demo/teacher`.

## Next executable step

1. Decide whether the live contract may exceed 10 seconds per call. If not, select a faster Meta model or reduce the draft output.
2. Attach official event rules and model eligibility evidence.
3. Commit or revise the provider-prompt fix, then run the focused checks again.
4. Re-run this checklist at a pinned revision and replace this diagnostic record with acceptance evidence.
