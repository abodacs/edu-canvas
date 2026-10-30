# IC1 focused re-trace — 2026-10-30

**Issue:** [#115](https://github.com/abodacs/edu-canvas/issues/115) (U3 / IC1) · **Guard:** #117 · **Failure contract:** #105 (deterministic matrix landed as PR #128; deadline contract 100 s / 200 s / 220 s per AgDR-0006) **Character:** post-#143-seam re-trace of the IC1 gate. The 2026-10-27 run (`ic1-2026-10-27/`) predates server-owned identity; this run re-proves the same path through the new identity, delivery, and records seams. **Revisions:** main `7847d46` + three fixes on `impl/115-ic1-live-trace` (see "Bugs found and fixed"). Worktree tree clean at each recorded phase; screenshots are gitignored local artifacts under `.scratch/ic1-2026-10-30/` (12 PNGs; referenced by filename below).

## Run identity

| Field | Value |
| --- | --- |
| Mode | **LIVE** (`DEMO_MODE=false`), provider per AgDR-0006, deterministic provider used only for the labeled fixture rehearsal |
| Provider / model | `muse-spark-1.2-contributor` via OpenAI-compatible `POST https://api.meta.ai/v1/responses`, strict `json_schema`, timeout 100 000 ms; total budget 200 s; lease 220 s |
| Access evidence | Direct probe: HTTP 200 in ~2.8 s with a strict-JSON-schema request (`.scratch/ic1-2026-10-30/probe-result.json`; error-variant isolation in `probe-detail-result.json`). Config finding: the checked-in `.env` base URL lacked `/v1` — the app would POST `/responses` (404); the run exported `OPENAI_BASE_URL=https://api.meta.ai/v1` (matches the 2026-10-27 record) |
| Eligibility evidence | [Meta Global AI Developer Hackathon 2026](https://dev.meta.ai/events/global-hackathon) (2026-10-26 → 2026-11-04); Muse Spark 1.1/1.2/1.3 on the permitted model list via the Meta Model API. **Limitation:** the `-contributor` tier's own rules text was not independently verified |
| Environment | Postgres 17 (docker), dedicated DB `edu_canvas_ic1_live`, 6 migrations applied, seeded; `SYNTHETIC_DATA_ONLY=true`; provider key server-only |
| Config check | `pnpm verify:config`: `demoMode: false`, `persistence: postgres`, `issues: []` |
| Baseline state | `lesson_draft_requests = 0`, `lesson_generation_attempts = 0` before the run |

## Input (focused, exact)

| Field | Value |
| --- | --- |
| Objective | Grade 4 equivalent fractions, CCSS `4.NF.A.1`, English, one focused objective; prompt "equivalent fractions for grade 4" (GUI) / equivalent API payload |
| Curated reference | `activity_version_demo_equivalent_fractions_v1` (version_number 1), graph `equivalent-fractions-v1`, standard `standard_ccss_4_nf_a_01`, tenant `tenant_demo_eu_synthetic`, catalog `edu-canvas-matching-v0` |
| Provenance | Synthetic seed fixture over the public CCSS standard; reuse evidence = seeded graph + pinned activity version. **Not** a live Learning Commons result — labeled per the issue |
| Correlation | Per-request UUIDv7 ids + idempotency keys; request → persisted row → preview provenance strip carry the same id |

## Stage evidence (live gate — two runs)

Both runs are live Meta calls through the full identity → delivery → validation → persistence → projection → preview chain.

| Stage | API trace (`01a18de3-00d3-715a-890e-ef0b6eb1cda9`) | GUI gate (`01a18de4-cc2c-739b-adce-fd2d601d6d98`) |
| --- | --- | --- |
| Auth | context → sign-in (`membership-required`) → membership "Edu-Canvas Synthetic Classroom" → session CSRF, all 200 | Same chain through `/login` + `/login/membership` UI |
| Generation + validation | HTTP 200 in **15.97 s**; state `ready-for-review`, attempt 1, **4 variants**, 0 warnings / 0 errors; no raw payloads leave the server seam | HTTP 200 (server-side timing below); 4 model-authored variants: "Equivalent Fractions - Standard A / Standard B / Scaffold / Challenge", 3+3 pieces each (`live_draft_variants.png`); transient disabled state "Shaping the draft…" captured (`live_generating_state.png`) |
| Persistence + read-back | Row state `ready-for-review`; attempt row with idempotency key `7c2c69bd-…`; timestamps 17:37:06.771 → 17:37:22.594 UTC; provenance `{model: muse-spark-1.2-contributor, provider: openai, validatorVersion: lesson-validator-v2, promptTemplateVersion: lesson-prompt-v1}`; 5 diagnostics — `db-readback.txt` | Second row `ready-for-review`, idempotency key `1e4a14be-…` — same artifact |
| Projection | Preview SSE **23 067 bytes / 13 frames**, forbidden-key scan (`relationships`, `answerKey`, `correctTargets`, `tenantId`, `teacherId`, `idempotencyKey`, …) → **clean**; `x-edu-catalog: matching-v1` | Same scan in the fixture rehearsal → clean; the preview provenance strip renders Draft / Graph / **Model `muse-spark-1.2-contributor`** / Catalog (`live_preview_provenance.png`) |
| Preview render + interaction | SSE captured headlessly | Preview rendered from the persisted live draft; source 1/2 → candidate 2/4 → status **"Preview selection captured. Clear selection to try another pair."** (`live_selection_captured.png`) |
| Structural/semantic outcomes | Structural: accepted first pass (validator `lesson-validator-v2`); semantic: 5 warnings, 0 errors | Same validator; teacher-visible "Worth noticing" notes in the rehearsal screenshots |

## Unsupported request (negative gate — same delivery boundary)

| Field | Value |
| --- | --- |
| Input | Grade 5, `standard_ccss_5_nbt_b_05`, same HTTP seam (API lane; the studio hardcodes the supported standard by focused-scope design, so this check is not GUI-reachable — recorded as a boundary note, not a skip) |
| Expected / observed | **HTTP 422, code `GENERATION_INPUT_INVALID`, message "This learning objective is not supported. Use Grade 4 equivalent fractions (4.NF.A.1)."** in 77 ms (`live-unsupported.json`) |
| State comparison | Row totals **unchanged** (1 request / 1 attempt before and after on `edu_canvas_ic1_live`; 3/3 on the rehearsal DB) — no accepted draft replaced, no persisted package, no preview render |
| Publication boundary | Absent by design at this stage; the negative run proves no publishable artifact was produced. The limit is recorded, not worked around |

## Bugs found and fixed by this run (all three were IC1 blockers on main)

1. **Delivery seam flattened explicit rejections** — `e07efb8`. `mapGenerationError` collapsed `GenerationInputError`/`GenerationRequestError` into a generic 500 `GENERATION_FAILED`, losing the unsupported-objective contract from the 2026-10-27 evidence. Now: 422 `GENERATION_INPUT_INVALID` + curated message; per-code 404/409/422 mapping; the client honors server messages for seam codes only (`src/lib/generation-failures.ts`). Tests: delivery-error-mapping (11), policy-matrix IC1 rows, generation-failures (16).
2. **Fresh-DB deterministic sign-in always 503** — `a32b1f6` + `fa28d4e`. `grantMembership` inserted memberships without the tenant row the FK requires, and (uncovered until the first fix landed) without the learner identity row; `resolveAuthOrError` swallowed both causes into `AUTH_UNAVAILABLE`. Reproduced with the Postgres error chain (`23503` twice). Fixes: tenant upsert + learner-identity materialization inside the same transaction. Real-DB regression tests on the `pnpm test:database` gate path.
3. **Fresh-DB generation always failed after sign-in** — `672a6ed`. The curriculum rows carry globally unique ids and `activity_versions`/`attempts` rows are immutable by trigger, so the seeded curriculum cannot move to the fixture school tenants; meanwhile the identity fixture granted teachers only school memberships with no curriculum, so the first generation died on the `lesson_draft_requests (tenant_id, standard_id)` FK. Fix: the fixture grants teacher memberships in the curriculum-owning classroom (data-only, idempotent). In-process deterministic generate reached `ready-for-review` before the live run.

## Honesty labels and limits

- The deterministic-mode rehearsal (auth → generate → preview, plus every rehearsal screenshot before `live_*`) is labeled **fixture**; it cannot pass IC1 and is not counted toward the gate.
- The five-hour event-day clock is **not claimed** by this re-trace (it is an event-day gate). Pipeline elapsed times are stated above; the fallback trigger therefore does not apply here — recorded per the issue's "unavailable checks" rule rather than reported as passed.
- Keyboard-only preview activation: **not executed** — the in-app-browser automation surface could not drive Enter/Space activation (three key paths tried; element focuses, no activation). DOM facts: real `<button type="button">`, `tabindex` 0, not disabled — the control is keyboard-ready, and a pre-#143 headless-Chromium run passed this check, but **this run does not claim it**. Next executable step: re-run with headless Chromium.
- Narrow-viewport (390 × 844): executed in the **fixture** run only — no horizontal overflow (scrollWidth 375 = clientWidth 375), clean stacking (`g7_narrow_390_top.png`, `g7_narrow_390_preview.png`).
- Teacher content/pedagogy review: **not performed** (human task). The semantic validator reported 5 warnings / 0 errors on the API trace and 0/0 on the GUI trace; validator coverage of mathematical and pedagogical quality remains unverified.
- First live-server boot returned 503 on all auth routes; an identical-env restart resolved it and in-process reproduction of the same path passed throughout. Suspected first-boot fixture-provisioning failure inside the memoized composition; not root-caused — next executable step is a fresh-DB first-boot reproduction.
- Eligibility: the `-contributor` tier's rules text was not independently verified (see Run identity).

## Broader U3 remains open (not pulled into this proof)

- Complete sourced `lesson-package-v2` path with #112's versioned records — the records port (PR #144) sits on `impl/98-authentication`, one PR from main, with no generation-path callers yet.
- Actual Learning Commons grounding / upload / source-recovery under #113/#114 + the Jev integration — one curated seed reference does not establish those paths.
- Broader grounded-package AC07/AC08 failure evidence referencing #105, and the complete U3 acceptance mapping.

## Verification

- `pnpm test:database` (real backend): persistence-contract + identity-parity **40/40 passed** post-fix.
- `pnpm verify:lesson-gate`: 4/4 property tests passed.
- `pnpm typecheck` clean; `ultracite check` clean on all changed files.
- Full `pnpm check`, production `pnpm build` + `pnpm start` + `pnpm smoke`: recorded in the PR description (run attached there after landing).

## Reproduction

```bash
docker compose up -d postgres
# create the dedicated database, then:
set -a; . ./.env; set +a
export DATABASE_URL="postgresql://…/edu_canvas_ic1_live" \
       DEMO_MODE=false \
       OPENAI_BASE_URL="https://api.meta.ai/v1" \
       OPENAI_MODEL=muse-spark-1.2-contributor
pnpm db:migrate && pnpm db:seed && pnpm verify:config
pnpm dev            # or: pnpm build && pnpm start
# GUI: /login → amira.north@example.test (deterministic dev provider) →
#   choose "Edu-Canvas Synthetic Classroom" → Create lesson → preview interaction.
# API: the trace capture script mirrors the same chain and records the artifacts above.
```
