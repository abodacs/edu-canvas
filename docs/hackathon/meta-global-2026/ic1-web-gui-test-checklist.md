# IC1 web GUI test checklist

**Superseded 2026-10-27:** the deadline contract is now 100 s per call, 200 s total, and a 220 s lease. [#105](https://github.com/abodacs/edu-canvas/issues/105) landed as PR #128. The Gate 0 and Gate 5 rows below record the pre-run state on 2026-10-26 and are historical.

**Issue:** [#115](https://github.com/abodacs/edu-canvas/issues/115). **Guard:** [#117](https://github.com/abodacs/edu-canvas/issues/117). **Failure contract:** [#105](https://github.com/abodacs/edu-canvas/issues/105). **Candidate revision:** `bfbdf9b571773948dd396e681942994c1a0d013b` (branch `refactor/generation-acceptance-and-rendering`). Record the SHA again at run time; do not test a dirty tree. **Clock:** five focused hours. Record start, finish, elapsed, and the fallback trigger.

## What this test is

This is the edu-canvas lesson-generation flow. It is not the E-MEETING-V2 meeting-intelligence flow from the referenced session. Only the GUI-test method transfers: fixed setup, state-by-state checks, database checks, linked identifiers, screenshots, and cleanup.

Use one Grade 4 equivalent-fractions request (`4.NF.A.1`), English, one focused objective, one recorded reference, and one event-allowed model. A fixture run is labeled **fixture** and cannot pass IC1.

## Gate 0 — current blockers

| Gate | Status on 2026-10-26 | Effect |
| --- | --- | --- |
| #117 evidence record | **Missing.** No evidence file or issue comment found. #117 is open. | #115 says to read it first. Record the absence as the first unavailable check. |
| Event-allowed model | **Unproven.** Current `.env` has `DEMO_MODE=true`, `OPENAI_MODEL=glm-5.2`, and `OPENAI_BASE_URL=https://api.z.ai/api/paas/v4/`. The factory selects the deterministic fixture in demo mode. GLM is not a Meta model. | Cannot prove live generation or event eligibility. |
| Provider contract | **Unverified.** The adapter posts to `/responses` with a strict JSON schema and a 15-second abort. AgDR-0006 says 10 seconds per call and 25 seconds total. | The allowed model must support this endpoint and schema, or the adapter needs a code change. |
| #105 guarantees | **Open, no evidence record.** | Do not claim deadline, idempotency, cancellation, or ownership guarantees from #115. |
| Curated reference | **Partial.** Seed has `activity_version_demo_equivalent_fractions_v1`, graph `equivalent-fractions-v1`, and standard `standard_ccss_4_nf_a_01`. The generation request has no reference field, and the prompt sends only the standard ID. | Record the reference manually. Do not claim the model was grounded on it. |

**Decision:** do not start the five-hour IC1 clock until model access and the #117 record are resolved. If access fails, use the focused-scope fallback ladder (Cut 2 or Kill). Do not count a fixture as live success.

## Gate 1 — preflight

Record each result in the evidence record. Stop at the first failure.

1. **Revision.** Record full SHA, branch, and `git status --short` (must be empty). Record any local change under test.
2. **#117.** Read the baseline record. Record its first failing or unavailable check. If absent, record that as a blocker.
3. **Eligibility.** Link the official rules page and version/date. Record the permitted model, registration/eligibility, and existing-code reuse decision. Credential presence is not access evidence.
4. **Direct model probe.** Call the exact endpoint and model once, outside the GUI. Record HTTP status, latency, response shape, and whether it accepts `/responses` with strict JSON schema. Do not paste the key or raw private payload.
5. **Database.** Confirm PostgreSQL is healthy, migrated, and seeded.
6. **Environment.** Set `DEMO_MODE=false`, `SYNTHETIC_DATA_ONLY=true`, `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_BASE_URL`. Keep the key server-only.
7. **Config check.** `pnpm verify:config` must show `demoMode: false`, `persistence: postgres`, and `issues: []`.
8. **Baseline state.** Record accepted request IDs and counts before the run.
9. **Reference record.** Record reference ID, version, source, and provenance date. Use `activity_version_demo_equivalent_fractions_v1` / `equivalent-fractions-v1` / CCSS `4.NF.A.1` only if that is the selected reference.

```bash
docker compose up -d postgres
export DATABASE_URL=postgresql://edu_canvas:edu_canvas_dev@127.0.0.1:5432/edu_canvas
pnpm db:migrate
pnpm db:seed
set -a; . ./.env; set +a
pnpm verify:config
pnpm dev
```

```bash
curl -fsS http://localhost:3000/api/readiness
```

Baseline SQL:

```sql
select count(*) filter (where state = 'ready-for-review') as accepted,
       count(*) as total
from lesson_draft_requests;

select count(*) from lesson_generation_attempts;

select id, state, created_at
from lesson_draft_requests
where state = 'ready-for-review'
order by created_at;
```

## Gate 2 — supported path through the GUI

Open `http://localhost:3000/demo/teacher`.

Exact input:

| Field | Value |
| --- | --- |
| Prompt | `Explain equivalent fractions for Grade 4 in English. Match 1/2 with 2/4, 3/6, and 4/8.` |
| Grade | 4 |
| Standard | `standard_ccss_4_nf_a_01` (`4.NF.A.1`) |
| Language | `en` |
| Difficulty | `on-level` |
| Idempotency key | Capture the value from the POST body, or record the new UUID. |
| Reference | `activity_version_demo_equivalent_fractions_v1`; graph `equivalent-fractions-v1`; CCSS `4.NF.A.1`; record provenance URL and date. |

The GUI hardcodes the standard. It derives grade and language from the prompt. The prompt text is not an objective boundary.

| # | Stage | Action | Expected | Record |
| --- | --- | --- | --- | --- |
| 1 | Run identity | Record before submitting. | Full SHA, environment, time, explicit **live** mode, provider/model, access evidence link. | Text record. |
| 2 | Generate | Enter the prompt and click **Create lesson**. | POST returns success. Button disables and shows a progress state. A result appears. | Request URL/body, start/end, latency. |
| 3 | Structural validation | Inspect the result. | `state: ready-for-review`; four variants; `provenance.provider` is not `deterministic-fixture`. | State, attempt, diagnostics. |
| 4 | Semantic validation | Inspect diagnostics and the attempt row. | No blocking diagnostics. Warnings are listed. Record validator versions. | Diagnostics, `correction_attempted`, validator versions. |
| 5 | Save | Query the database. | One request row with `state=ready-for-review`, non-null draft, and attempt 1. One attempt row with the idempotency key. | SQL output. |
| 6 | Read back | Query by `requestId`. Open the preview URL directly. Reload the page. | Same request and draft. Preview reads the persisted record. | `requestId`, `updated_at`, preview response. |
| 7 | Projection | Inspect the network response. | Only public fields. No answer key, relationships, tenant ID, or teacher ID. | Field list and negative checks. |
| 8 | Preview | Open all four tabs. Select source `1/2`, then target `2/4`. Use Left/Right arrows. Clear the selection. | Four surfaces. Selection text confirms source/target. No publish or grading action. | Screenshot or recording path. |
| 9 | Correlation | Map identifiers across every stage. | One `requestId` links the response, DB row, preview, and screenshot. | Request ID, idempotency key, attempt number, timestamps. |

There is no separate operation ID. Use `requestId` plus `lesson_generation_attempts.idempotency_key` plus `attempt_number`. Record that limit.

Direct preview URL:

```text
http://localhost:3000/api/a2ui/preview?role=teacher&requestId=<requestId>&catalogVersion=matching-v1
```

Persistence SQL:

```sql
select id, state, attempt, standard_id, language, grade,
       provenance, diagnostics,
       jsonb_array_length(draft->'variants') as variants,
       created_at, updated_at
from lesson_draft_requests
where id = '<requestId>';

select request_id, attempt_number, idempotency_key, state,
       correction_attempted, diagnostics, provenance, created_at
from lesson_generation_attempts
where request_id = '<requestId>'
order by attempt_number;
```

Validation limits to record:

- Structural validation is proved by the accepted draft shape and diagnostics.
- Semantic validation is inferred from non-pass diagnostics. The full validator report is not persisted or exposed.
- Correction count is `correction_attempted` (boolean), not a provider-call count.
- The curated reference is not sent to the provider. Do not claim reference grounding.

## Gate 3 — unsupported objective through the same entry point

Exact unsupported input:

| Field           | Value                                                 |
| --------------- | ----------------------------------------------------- |
| Prompt          | `Teach Grade 5 multi-digit multiplication.`           |
| Grade           | 5                                                     |
| Standard        | `standard_ccss_5_nbt_b_05` (not in the supported set) |
| Language        | `en`                                                  |
| Difficulty      | `on-level`                                            |
| Idempotency key | New value.                                            |

The GUI cannot send an unsupported standard because it always sends the seeded standard. Send the request through the same server-function entry point:

1. Open DevTools → Network.
2. Generate one supported draft.
3. Find the POST to `/_serverFn/<id>` with header `x-tsr-serverFn: true`.
4. Copy the request as `fetch`.
5. Change only `standardId` to `standard_ccss_5_nbt_b_05`.
6. Send it and record the status and body. Redact the key and private data.

The built endpoint ID is in `.output/server/_ssr/server-function-*.mjs`, but DevTools is authoritative for the running build.

Expected:

- Explicit rejection or clarification. The service throws `Generation input is invalid.`
- No new `lesson_draft_requests` row.
- No new `lesson_generation_attempts` row.
- No new accepted preview.
- No existing accepted lesson replaced.

Before/after check:

- Repeat the baseline SQL. The counts must not change.
- Compare the accepted request ID list. The existing list must be unchanged.
- If the response is a generic server error, record the exact status/body as a failure, not a pass.

GUI prompt check:

- Type the unsupported prompt in the textarea and submit.
- The GUI still sends `standard_ccss_4_nf_a_01` and may create an accepted draft.
- Record this as a boundary gap. Do not claim the prompt path rejects unsupported objectives.

Publication check:

- If a publication boundary exists, show that it rejects this result.
- If no boundary exists, record that limit. Do not add publication work to IC1.

## Gate 4 — one sanitized evidence record

Live run: [2026-10-27 evidence record](evidence/ic1-2026-10-27/README.md) and [IC1 baseline](ic1-baseline-2026-10-27.md). The earlier [2026-10-26 diagnostic run](evidence/ic1-2026-10-26/README.md) used a temporary timeout and is not acceptance evidence.

| Stage | Required record | Result |
| --- | --- | --- |
| Run identity | Full revision, environment, configuration, timestamp, **live** mode, provider/model, access/eligibility evidence link. | Pending |
| Input | Exact synthetic objective, request settings, reference ID/version/provenance, request/operation correlation. | Pending |
| Generation and validation | Actual provider result, structural outcome, semantic outcome, correction count, diagnostics. No raw private payload. | Pending |
| Persistence | Persisted ID/status/version and read-back evidence. | Pending |
| Projection and preview | Sanitized public projection, preview URL/steps, screenshot or recording, interaction result. | Pending |
| Unsupported request | Exact input, expected/observed rejection, before/after state, no publishable artifact, no accepted preview. | Pending |
| Limits | Failed checks, unavailable checks, blockers, and next executable step. | Pending |

Sanitize credentials, student identifiers, private answer mappings, and raw provider payloads. Label any shortened wait. Label fixture output **fixture**.

## Gate 5 — reuse related work

| Source | Current status | How to use it |
| --- | --- | --- |
| #117 baseline | Missing. | Record the absence. Do not claim its inventory or verification map. |
| #105 deadline/idempotency/ownership checks | Open. No evidence record. | Reference any completed checks. Do not claim its guarantees. Do not build a second retry system. |
| `pnpm verify:lesson-gate` | Structural properties only. | Supports the draft/path contract. Does not prove live access, semantic quality, persistence, rendering, or interaction. |
| Existing `service.test.ts` | Fixture tests. | Supports behavior. Label **fixture**. Does not replace the real run. |

Current code mismatch to record: the provider uses a 15-second abort. AgDR-0006 and #105 say 10 seconds per model call. The 25-second total budget is not proved by #115.

## Gate 6 — project checks

Run these only if application code changes. Record the command, exit code, and summary.

```bash
pnpm check
```

If the full command is unavailable, run at least:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm verify:architecture
pnpm verify:client-boundary
pnpm verify:boundaries
pnpm build
```

Passing tests support the evidence. They do not replace the live run. If no application code changes, record that fact and the baseline checks for the pinned SHA.

## Gate 7 — done and not done

IC1 passes only when all are true:

- Live provider provenance, not `deterministic-fixture`.
- One accepted draft within the recorded limits.
- The accepted draft is persisted and read back.
- The public projection contains only permitted fields.
- The existing A2UI preview renders that draft and its supported interaction works.
- The unsupported request is rejected explicitly.
- No accepted lesson, package, or new preview is created by the rejected request.
- No existing accepted lesson is replaced.

IC1 fails or blocks when any are true:

- Model access or eligibility is unproven.
- The provider contract is incompatible.
- Validation blocks the draft.
- Persistence or read-back fails.
- The preview differs from the persisted draft.
- Rejection is not explicit.
- Only a fixture run is available.

Fallback: if IC1 misses Day 1, apply the focused-scope fallback ladder. Do not silently choose Cut 2 or Kill; record the applicable trigger and the unresolved selection.

Passing IC1 does not close #115. Record these separately as complete or incomplete:

- Approval and immutable publication.
- Learner attempt and server grading.
- Teacher evidence and override.
- Live Learning Commons grounding.
- Jev objective matching.
- Uploads/OCR.
- Bilingual rollout.
- Broader package and source-integration requirements.

## Decisions needed

| Decision | Default if unanswered |
| --- | --- |
| Which event-allowed model and provider are confirmed? | None. IC1 stays blocked. |
| Is the #117 evidence record available? | No. Create it or record the missing check first. |
| Run a fixture dry run before live? | Yes. Label it **fixture**. It validates the GUI and evidence steps only. |
| Use PostgreSQL for the run? | Yes. It provides read-back evidence. |
| Add a reference field, operation ID, or prompt objective gate? | No code change for IC1. Record the gaps. |
| Treat a typed unsupported prompt as the rejection proof? | No. Use the same-entry-point replay with an unsupported `standardId`. |
| Add publication controls? | No. Record the absent boundary as a limit. |

## What to do now

1. Do not rerun the E-MEETING-V2 session procedure. Do not use the #118 teacher simulation as generation evidence.
2. Resolve Gate 0: confirm the event-allowed model and read #117.
3. If resolved, start the clock. Run Gate 2, then Gate 3.
4. If not resolved, run a labeled fixture dry run to validate the steps. Apply the fallback ladder. Do not claim IC1.
