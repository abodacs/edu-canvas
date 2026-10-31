# U4 fractions-v2 — verification record (2026-10-31)

Issue: [#116 — U4: render MathText and FractionDiagram in fractions-v2 with a complete keyboard path (AC16/AC17)](https://github.com/abodacs/edu-canvas/issues/116) Branch: `impl/116-u4-fractions`, head `0d6c8a0`, base main `4b10960`.

## What landed

1. `20eb479` — fractions-v2 catalog: version registry (`matching-v1` retained), `MathText` (bounded LaTeX subset → MathML tree, ≤500 chars, fail-closed `INVALID_MATH`), `FractionDiagram` (integer numerator 0 through denominator, wholes 1–12, `INVALID_FRACTION_VALUE`), typed `setFractionValue`/`advanceStage` actions, catalog-scoped validation (`validateA2UIMessage` with a pinned catalog), per-catalog scoping in the renderer state machine, MathML renderer (native `<math>`, zero client dependency), CSS simple-bar slice with keyboard steppers, text equivalents, live region, RTL through logical properties.
2. `ac0572b` — server: `compileFractionPreview` (one surface per section, blocking diagnostic names the section for unparseable math), catalog-pinned preview negotiation (`UNSUPPORTED_CATALOG` on mismatch), `fraction-stage.ts` decisions (`permittedStageAfter`, `decideFractionValue`), shared `fractions-contract.ts` authoring schema, fixture-record tests, render-path integration test.
3. `0d6c8a0` — catalog-aware persistence codec: fraction-pinned records hydrate `fractionDraft` through `fractionLessonDraftSchema`; matching records keep the existing contract; preview seam fails closed when the pinned catalog and the stored draft disagree.

## Static gates

- `pnpm check` (format, lint, lint:styles, typecheck, tsrs, unit tests, build, verify:client-boundary, verify:architecture, verify:identity-surface, verify:lc-mcp-eval, verify:lc-free-text, verify:boundaries): green at `20eb479`/`ac0572b` and re-run at head (see PR evidence).
- Contract tests: 20 shared-contract/parser tests incl. unknown-catalog, catalog-scoped unknown component/action, `INVALID_MATH`, `INVALID_FRACTION_VALUE`, parser structure cases.

## Live keyboard-only lane (2026-10-31, localhost:3000)

Environment: deterministic provider (`APP_ENV=development`, `DEMO_MODE=false`, `AUTH_PROVIDER=deterministic`), dedicated DB `edu_canvas_116` (fresh migrations + seed), built server (`node .output/server/index.mjs`), Playwright 1.55 core + cached Chromium 1248, `reducedMotion: "reduce"`, keyboard-only interactions (`page.keyboard` only).

Honest fixture boundary: the studio's generate response is route-intercepted (generation cannot emit fraction drafts yet — that producer is the broader U4 lane). The preview API request is real end-to-end: session resolution, teacher role, tenant/ownership, pinned-catalog negotiation, compile, SSE stream, client validation, rendering. Two fixture records (`draft_req_fraction_kbd` en/ltr, `draft_req_fraction_rtl` ar/rtl) were inserted directly with tenant-aligned standards.

| Check | LTR run | RTL run |
| --- | --- | --- |
| K1 header pins `fractions-v2` | PASS | PASS |
| K2 MathText renders native MathML (`mfrac`, `mn`) | PASS (2 fracs) | PASS |
| K3 math accessible equivalent (`aria-label`) | PASS | PASS |
| K4 stepper input changes with arrow keys | PASS (1→2) | PASS (1→2) |
| K5 live region announces shaded count | PASS ("2 of 4") | PASS* ("2 of 2") |
| K6 out-of-range input → inline error, no commit | PASS | PASS |
| K7 `advanceStage` moves to next permitted stage | PASS | PASS |
| K8 second stage renders math + diagram | PASS | PASS |
| K9 no positive tabindex in the document | PASS | PASS |
| K10 320 px viewport, no horizontal overflow | PASS (320/320) | PASS (320/320) |
| K11 focus indicator visible on stepper controls | PASS | PASS |
| K12 RTL mirror inherits `dir`, bar mirrors | n/a | PASS (`dir=rtl`) |

\* The RTL run's K5 note shows the announcement for that fixture's denominator (2); the assertion text was written for the LTR fixture's denominator 4. The live region announced correctly in both runs.

## Remaining limitations

- Generation cannot produce fraction drafts yet; the fraction authoring contract is consumed at the preview boundary and the provider producer stays with the broader U4 lane.
- `advanceStage` persists nothing: the decision module is tested and the preview advances the previewed stage locally; the server-authorized learner transition and stage persistence land with learner delivery (#6/#7).
- Adjustable-diagram (SVG) acceptance is not implemented — this slice is the documented simple-bar slice per AC5.
- Bilingual rollout stays out of scope (#9's RTL state is exercised, copy localization is not).
