# Blocked generation: failure-class scenarios and checks

| Field | Value |
| --- | --- |
| Issue | [#119](https://github.com/abodacs/edu-canvas/issues/119) |
| Revision | 2026-10-31 |
| Code baseline | commit `7847d46` |
| Status | Specification. No check has run. |
| Implementation owner | [#115](https://github.com/abodacs/edu-canvas/issues/115); the recovery base landed in [#10](https://github.com/abodacs/edu-canvas/issues/10) |
| Series | Ticket 03. Ticket 01 is [recovery](blocked-generation-recovery.md). Ticket 02 is [keyboard](blocked-generation-keyboard.md). |

This document is the scenario inventory for ticket 03. It lists the failure classes that follow a Create draft action. For each class it names the fixture, state, visible reason, action, and retry. It also gives eleven binary checks for #115.

In scope: moderation, timeout, quota or rate-limit, validation block, and preview disconnect. Preview timeout is part of the preview class.

Out of scope: detection rules (#132), panel copy (ticket 01), keyboard behavior (ticket 02), and any change under `src/`.

These checks are for #115. They have not been run. No UI exists for the blocked state at `7847d46`.

## 1. Failure-class inventory

| Failure class | Fixture shape | Persisted state | Visible reason source | Action | Retry | Checks |
| --- | --- | --- | --- | --- | --- | --- |
| Moderation | `blocked-by-moderation`; `draft: null`; `retry.available: false` | `blocked-by-moderation` | Category copy in `#blocked-generation-reason` | "Revise request" | None | S1, S2, S11 |
| Timeout | `failed-retryable`; `GENERATION_DEADLINE_EXCEEDED` or `PROVIDER_TIMEOUT` | `failed-retryable` | Diagnostic message in the request record | "Try that again" | Yes; new operation key | S3, S4 |
| Quota or rate-limit | `failed-retryable`; `PROVIDER_RATE_LIMIT` | `failed-retryable` | Provider `safeMessage` on the diagnostic | "Try that again" | Yes; new operation key | S5 |
| Validation block | `blocked-by-validation`; gate and curriculum diagnostics | `blocked-by-validation` | Validator diagnostics in the request record | Review diagnostics, then "Try that again" | Yes; same metadata | S6 |
| Preview disconnect | `ready-for-review`; preview stream aborted or stalled | `ready-for-review`; unchanged | Preview status text and the `role="alert"` recovery block | "Retry preview" | Preview only; no generation retry | S7, S8 |

Rules:

- Moderation is the only class with "Revise request".
- Timeout, quota, and validation never use moderation copy.
- A preview failure never changes the generation record.
- The category code needs a carrier to the panel. The public result has no category field at `7847d46`; #132 and #115 must agree on one.

Sources:

- Moderation retry projection: `projection.ts:47-52`.
- Deadline and timeout: `service.ts:60`, `:221-225`, `:235-240`.
- Provider failure mapping: `service.ts:249-268`.
- Validation retry copy: `projection.ts:36-44`.
- Preview copy: `lesson-preview.tsx:21-32`, `:96-99`, `:137-141`, `:166-177`.

## 2. Harness

- Use Playwright 1.64.x with the cached Chromium at `$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`.
- Register `page.route` for `**/api/lessons/generate` and `**/api/a2ui/preview` before navigation.
- Fulfill schema-valid payloads. Do not call a real provider.
- Launch with `reducedMotion: "reduce"`.
- Reach the Prepare workspace through the demo entry with a synthetic teacher session.
- Put unique canaries in `diagnostics[].message`, `provenance.model`, and the prior draft's `hints`, `feedback`, and `targetItems`.
- Record the commit, the payloads, and the command.

Every check uses route interception, not a real provider.

## 3. Binary checks

**S1 — Moderation input block.** Setup: fulfill a blocked result before any provider call; `draft: null`. Assert: `#blocked-generation` renders; the reason equals the category copy; no variant section exists. Pass: one panel, the category copy, and zero drafts.

**S2 — Moderation output block with a prior draft.** Setup: fulfill `ready-for-review` with four variants and wait for the draft. Then fulfill a blocked result with a new `requestId`. Assert: the draft node stays connected and unchanged; the panel shows the earlier-draft note. Pass: both assertions hold.

**S3 — Deadline timeout.** Setup: fulfill `failed-retryable` with `GENERATION_DEADLINE_EXCEEDED` and `retry.available: true`. Assert: the "Try that again" control renders; no moderation panel renders; the copy names the deadline. Pass: all three assertions hold.

**S4 — Provider timeout.** Setup: fulfill `failed-retryable` with `PROVIDER_TIMEOUT` and its provider message. Assert: "Try that again" renders; the provider timeout copy is visible; "Revise request" is absent. Pass: all three assertions hold.

**S5 — Quota or rate-limit.** Setup: fulfill `failed-retryable` with `PROVIDER_RATE_LIMIT` and a provider `safeMessage`. Assert: "Try that again" renders; the safe message is visible; no moderation copy appears. Pass: all three assertions hold.

**S6 — Validation block.** Setup: fulfill `blocked-by-validation` with one gate diagnostic and one curriculum diagnostic; retry is available. Assert: both diagnostics render; "Try that again" renders; "Revise request" is absent. Pass: all three assertions hold.

**S7 — Preview disconnect.** Setup: fulfill `ready-for-review`; wait for the preview; abort `**/api/a2ui/preview`. Assert: the recovery block has `role="alert"` and the disconnect message; the generation state stays `ready-for-review`. Pass: both assertions hold, and no generation retry appears.

**S8 — Preview timeout.** Setup: fulfill `ready-for-review`; fulfill the preview route with a response that never closes. Assert: after eight seconds, the status is timed-out with its message; the draft stays visible. Pass: both assertions hold.

**S9 — Cross-class copy isolation.** Setup: render S1, S3, S5, and S6 in sequence. Assert: "Revise request" appears only for moderation; the three scoped moderation nodes never contain "retry"; no class shows another class's copy. Pass: all three assertions hold.

**S10 — Fixture canaries.** Setup: use the moderation fixtures with unique canaries in diagnostics, provenance, and prior draft fields. Assert: no canary appears in `#blocked-generation-reason`, `#blocked-generation-announcement`, or `#blocked-generation-reference`. Pass: every absence holds.

**S11 — `MODERATION_REVISION_REQUIRED` maps to the moderation panel.** Setup: fulfill the generate route with an error payload that carries `MODERATION_REVISION_REQUIRED`. Assert: the moderation panel renders; the heading takes focus; one announcement equals the reason; "Revise request" is the only action. Pass: all four assertions hold.

S11 checks the class mapping. K27 in [ticket 02](blocked-generation-keyboard.md) checks the same path through the full keyboard contract.
