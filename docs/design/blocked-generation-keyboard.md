# Blocked generation: keyboard and announcement contract

Design specification for issue [#119](https://github.com/abodacs/edu-canvas/issues/119), ticket 02. Implementation belongs to [#115](https://github.com/abodacs/edu-canvas/issues/115) and [#10](https://github.com/abodacs/edu-canvas/issues/10). This document specifies behavior, not observed behavior: no blocked panel exists at revision `7847d46`. Category code names stay provisional until [#132](https://github.com/abodacs/edu-canvas/issues/132) lands. The [UI implementation gate](../product/teacher-ui.md#implementation-gate) still applies.

The contract covers both block moments. An input block stops the prompt before any provider call and has no draft. An output block withholds the generated draft before persistence and preview. Both use the same `blocked-by-moderation` panel and the same keyboard path. The panel's title, reason, objective, reference, and action belong to [ticket 01](blocked-generation-recovery.md). This document owns focus, announcement, tab order, return, draft preservation, and the checks.

The [focused UI plan](../hackathon/meta-global-2026/focused-ui-plan.md#define-recovery-beside-each-action) requires recovery beside each action and a keyboard-complete teacher path. The [focused scope](../hackathon/meta-global-2026/focused-scope.md#success-criteria) requires keyboard alone to complete teacher actions. The existing composer, result shell, and focus ring are in [teacher-studio.tsx](../../src/components/studio/teacher-studio.tsx) and [styles.css](../../src/styles.css).

## 1. Entry and focus

Entry condition: the teacher workspace receives a `PublicGenerationResult` whose `state` is `blocked-by-moderation` ([generation-contract.ts](../../src/shared/generation-contract.ts)) and whose `requestId` differs from the last blocked request that moved focus. The panel is a sibling of the composer, not a modal.

Focus target: the panel heading.

```html
<section
  id="blocked-generation"
  aria-labelledby="blocked-generation-heading"
  lang="en"
  dir="ltr"
>
  <h2 id="blocked-generation-heading" tabindex="-1">
    Let’s reshape that request.
  </h2>
  <p id="blocked-generation-reason">
    Safety review blocked this request: personal data. Your objective is still
    here.
  </p>
  <p id="blocked-generation-reference">
    Request <bdi dir="ltr">0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b</bdi>
  </p>
  <button id="revise-request" type="button">Revise request</button>
</section>
```

The reason and reference copy above are illustrative. Ticket 01 and #132 own the final strings; the identifiers, roles, and focus behavior are binding.

- Move focus in a layout effect after the panel is in the DOM. Do not use `autoFocus`; it fires again on remounts and can steal focus later.
- Focus the heading because it names the state, carries heading semantics, and activates nothing. Focusing `Revise request` would skip the reason and the preserved objective. Focusing the section container gives no precise reading position. It may also read the whole region.
- Allow the browser to scroll the focused heading into view. Do not pass `preventScroll: true`.
- Show a visible focus ring on the heading, using the same `:focus-visible` treatment as other controls.
- Defer focus during an active IME composition and move it on `compositionend`. Never cancel or commit a composition to focus the panel.
- On an output block, focus still goes to the blocked heading, never into the existing draft.
- Only a new `blocked-by-moderation` request may move focus. Re-delivery of the same `requestId`, polling, diagnostics expansion, locale changes, and every other result state must not move focus.
- The panel is not a dialog: no `role="dialog"`, no `aria-modal`, no focus trap. The teacher can Tab or Shift+Tab out of the panel at any time. Escape is not required and does not close it.

### Error path: `MODERATION_REVISION_REQUIRED`

A same prompt under a new operation key is not a moderation state. The service returns an error response (`service.ts:889-899`). The route currently maps it to `GENERATION_FAILED` (`delivery.server.ts:47-58`), so the code does not reach the client today.

#115 must render the same panel for this error. The panel uses the same heading focus, the same live-region text, and the same `Revise request` action. The preserved objective is the submitted prompt. The request reference may be absent; the service creates no record.

## 2. Announcement

Use one persistent live region, mounted empty with the composer before any result exists:

```html
<p
  id="blocked-generation-announcement"
  class="sr-only"
  role="status"
  aria-live="polite"
  aria-atomic="true"
></p>
```

- `role="status"` supplies the implicit polite live semantics. Set `aria-live="polite"` and `aria-atomic="true"` explicitly so the contract is testable.
- Use polite semantics, not `role="alert"` or `aria-live="assertive"`. The block has no time limit, and focus also moves to the panel.
- Announce exactly the visible reason from `#blocked-generation-reason`, with whitespace normalized. Do not add the title, request reference, action hint, diagnostics, or objective text.
- Write the text once per `(requestId, reason)` pair. Keep a ref or stable state key so React StrictMode double effects, polling, duplicate delivery, and re-renders cannot rewrite it.
- For a new `requestId` whose reason string equals the previous one, clear the region to empty and write the text on the next frame. Identical text alone produces no DOM change and no announcement. Do not clear or rewrite for a re-delivery of the same request.
- The region must exist empty before the text changes. Do not mount a populated live region; several screen readers skip initial content.
- The existing `GenerationResult` renders `<output className="sr-only">{getStatusAnnouncement(result.state)}</output>`, which yields `Generation state: blocked by moderation` for this state. Suppress that output for `blocked-by-moderation`; the dedicated region is the only announcement. Exactly one live region may change for a block.
- Do not attach the reason to the heading through `aria-describedby`. Focusing the heading would read it a second time. The heading exposes the title; the live region carries the reason once; the visible reason is next in reading order.
- Clearing the region when the panel unmounts is allowed. Clearing to empty is not an announcement, and the same text must not be inserted again for the same request.
- The panel's `aria-labelledby` names the region landmark. It does not need `aria-describedby`.

## 3. Tab order

Panel DOM order:

1. Heading, programmatically focusable but not in the Tab sequence.
2. Visible reason.
3. Request reference, plain text and not a tab stop.
4. `Revise request`, the panel's only action.

- Every interactive element in the panel is a native `<button>` or `<a href>`. Do not use clickable `div` or `span` elements or `role="button"` substitutes.
- `Revise request` is `<button type="button" id="revise-request">Revise request</button>`. `type="button"` prevents submission if the panel is later nested in a form. Do not call `preventDefault` on Space or Enter, and do not add a key handler that duplicates the synthesized click.
- No positive `tabindex`. The heading is `-1`; every other control uses native tab order.
- From the heading, Tab moves to `#revise-request`. From `#revise-request`, Tab moves to the next control after the panel, or leaves the panel when it is last. From the heading, Shift+Tab moves to the control before the panel in DOM order. No focus trap.
- DOM order and visual order agree at 320 pixels and on desktop. Do not use CSS `order`, absolute positioning, or markup reordering that separates them.
- Every panel control has a visible focus indicator. The global `:focus-visible` rule is `outline: 3px solid var(--ring); outline-offset: 3px`. Do not override it with `outline: 0` or `outline: none` without an equally visible replacement. The indicator must reach 3:1 contrast against the adjacent background.
- Hover-only affordances are forbidden. The action is reachable and operable without a pointer.
- The request reference has `id="blocked-generation-reference"` so K8 can find it. Plain text is not focusable.
- No keyboard shortcuts and no `accessKey`. Tab, Shift+Tab, Enter, and Space are the complete set.

## 4. Return to field

Activating `Revise request` with Enter or Space performs exactly these steps:

1. Do not submit, fetch, mint an operation key, clear the result, or call `updateRequestKey`.
2. Focus the existing objective field, `textarea#lesson-prompt`.
3. Place the caret at the logical end.

```ts
const field = document.querySelector<HTMLTextAreaElement>("#lesson-prompt");
if (field) {
  field.focus();
  const end = field.value.length;
  field.setSelectionRange(end, end);
}
```

- Focus first, then set the selection. Some browsers reset the selection when focus enters a text control.
- Never call `select()`. Select-all risks replacing the objective with the next keystroke.
- Never assign `field.value` or the controlled objective state. Do not trim, normalize, or reformat. The panel's objective snapshot is not authoritative for the field.
- Input block, no draft: return to the field and keep its current text. If the teacher edited the field while the request was in flight, the newer field text wins. Do not restore the blocked snapshot. Put the caret at the end of the current text.
- Output block: the same return applies. If a prior draft is visible, its selection, hint edits, and scroll position remain unchanged.
- If the panel unmounts because of the activation, move focus before unmount. Never leave `document.activeElement` on `<body>`.
- Do not write to the live region after returning focus. The textarea's label and value are the feedback; the block reason stays as the last announced text and is not repeated.
- Activation alone does not satisfy the revised-request rule. It sends nothing and mints no key. The next submit after the objective changes uses a new operation key; ticket 01 owns the server rule. Unchanged resubmission is not offered.
- Repeated activation is idempotent: the value is unchanged and the caret returns to the end.
- In RTL, the logical end is `value.length` even though it is the left visual edge. Do not compute it from bounding boxes or text direction.
- The field stays editable after return: `readOnly === false`, `disabled === false`, and the existing label `What should students practice?` stays associated.

The `.prompt-composer textarea` rule sets `outline: 0` (`styles.css:2027`). The `:focus` rule shows focus through `border-block-end-color` and `box-shadow` (`styles.css:2036-2039`). #115 must preserve or strengthen that indicator. A visible outline, border, or shadow at 3:1 contrast is sufficient. The caret alone is not a focus indicator.

## 5. Existing draft

Scope: a later regeneration is blocked while a prior accepted draft is visible. The block withholds the new output; it must not touch the prior draft.

Preserved element: `section[aria-label="Generated lesson variants"]` (the current `.variant-stack`) and its draft region. The draft region includes `section.a2ui-preview` from [lesson-preview.tsx](../../src/components/a2ui/lesson-preview.tsx). Keep the prior accepted request ID as the key.

- Mount the blocked panel as a sibling of the draft region. Never replace the draft region with the panel.
- Keep the same DOM node. Do not remount the draft and do not key it by the blocked request ID.
- Preserve draft text, selected variant, in-progress hint edits, preview selection, and preview scroll position.
- Entry focus goes to the blocked heading. No draft control receives focus when the panel appears.
- `Revise request` only moves focus to the objective field. It does not reset, collapse, or re-render the draft.
- Typing after the return must not unmount the draft. The current `updateRequestKey()` calls `setResult(null)`, which would discard a draft stored inside the transient result. #115 must keep the prior draft outside that transient result, or otherwise preserve it, until a new request succeeds.
- Do not announce draft content in the block live region.
- Do not programmatically scroll the draft when the panel appears or when focus returns.

## 6. Screen-reader copy

The live region text is the visible reason, verbatim. The panel exposes the visible title as the heading name. It exposes the section name through `aria-labelledby`. The button name is exactly `Revise request`. The request reference is visible text.

Allowed copy:

- The fixed safe explanation from ticket 01's copy map.
- A category label from #132's allowlist. The default names `personal-data` and `harmful-content` are provisional until #132 lands.
- A preserved-objective statement.
- The request reference, visible but not announced.

Forbidden copy, in the panel and the live region:

- Raw provider responses, upstream error bodies, model names, prompts, or generated output.
- `diagnostics[].message` when it is provider-derived. Build the reason from the fixed map; never interpolate the diagnostic message.
- API keys, environment values, stack traces, and internal diagnostic codes such as `MODERATION_BLOCKED`.
- Private answer data: `targetItems`, `distractorItems`, `hints`, `feedback`, answer keys, mastery, or saved responses.
- The blocked objective text inside the live region. The panel may show the preserved objective, but the announcement must not read it again.
- Invented moderation reasons such as "policy X" or "the model refused". Name only the #132 category.
- The banned words and provider-content rules in [ticket 01 section 8](blocked-generation-recovery.md#8-copy-rules).

The banned-phrase rule applies to the panel and the live region only. K8 scopes it to three elements.

Rules:

- Render all copy as text. Do not use `dangerouslySetInnerHTML`.
- Mark decorative icons `aria-hidden="true"`.
- Do not put an `aria-label` on the reason that differs from its visible text. Screen-reader copy and visible copy are the same string.
- If the visible reason changes, the live text changes in the same commit. If they cannot match, the implementation is incomplete.

## 7. Language and direction (deferred)

Arabic rollout is deferred by [focused scope](../hackathon/meta-global-2026/focused-scope.md) line 52 and [design question C3](design-doc-questions.md). English is the only shipped language for this panel.

- Use the submitted language for `lang` and `dir` on the panel and the live region. Do not derive direction from `draft?.variants[0]`; a blocked result has no draft.
- Wrap the request reference in `<bdi dir="ltr">` so digits and hyphens do not reorder.

## 8. Checks implementation must satisfy

This ticket does not run these checks; the panel does not exist at `7847d46`. #115 must run them and attach the command, revision, and output. These are UI contract checks, not moderation evidence and not IC1 evidence.

Harness:

- Use Playwright 1.64.x with the cached headless Chromium at `$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` and the matching driver. Do not use the IAB or in-app browser; it cannot send Tab and Enter reliably.
- Launch with `reducedMotion: "reduce"` so GSAP animations do not move focus or scroll targets during assertions.
- Register `page.route("**/api/lessons/generate", ...)` before navigation. Fulfill schema-valid `publicGenerationResult` payloads:
  - Input-block fixture: `state: "blocked-by-moderation"`, `draft: null`, no prior draft.
  - Output-block fixture: fulfill a `ready-for-review` result with four variants. Wait for `section[aria-label="Generated lesson variants"]`. Then fulfill a blocked result for a new request ID.
- Put unique canary strings in fields that must not leak: `diagnostics[].message`, `provenance.model`, and the prior draft's `hints`, `feedback`, and `targetItems`. Assert the panel and live region never contain them.
- Use only `page.keyboard.press` and `page.keyboard.type` for the keyboard-only check. Do not use `page.click`, `page.tap`, or `page.locator().click()`.
- Reach the Prepare workspace through the existing demo entry with a synthetic teacher session. Record the application commit and the blocked payloads.

The failure-class fixtures and their checks are in the [scenario inventory](blocked-generation-scenarios.md).

Checks:

Check IDs are stable. K22–K25 were removed when Arabic was deferred. The last check keeps the ID K26.

1. **K1 — Live region is ready before the block.** On first load, before any result, `#blocked-generation-announcement` exists with empty text. It has `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`. Its computed style is the `sr-only` pattern: `position: absolute`, `width: 1px`, `height: 1px`, and `overflow: hidden`. Pass when every assertion holds.
2. **K2 — Entry focus.** After the blocked result renders, `document.activeElement` is `#blocked-generation-heading`; the element is an `H2` with `tabindex="-1"`; its text equals the visible title. Pass when all three hold.
3. **K3 — Focus moves once per blocked request.** Focus the heading and Tab to `#revise-request`. Re-deliver the identical blocked payload for the same `requestId`. Wait one second. Focus remains on `#revise-request`. Repeat with focus in `#lesson-prompt`; focus stays there. Then deliver a second blocked result with a new `requestId`; focus moves to `#blocked-generation-heading`. Pass when re-delivery never moves focus and a new blocked request does.
4. **K4 — Typing does not steal focus.** With the panel visible, focus `#lesson-prompt`, type one character, and wait one second. `document.activeElement` remains `#lesson-prompt`. Pass when unchanged.
5. **K5 — Exactly one announcement.** Install a MutationObserver over every `[aria-live]`, `[role="status"]`, and `output` element before fulfilling the block. After the panel is visible and one second passes, exactly one non-empty text mutation occurred, and it occurred in `#blocked-generation-announcement`. Pass when the count is one and the target matches.
6. **K6 — Announcement matches the visible reason.** Normalize whitespace on `#blocked-generation-announcement.textContent` and `#blocked-generation-reason.textContent`. Pass when both are non-empty and equal.
7. **K7 — No repeat announcement.** After K6, Tab to `#revise-request`, Shift+Tab back, focus `#lesson-prompt`, re-deliver the same blocked result, and wait one second. The non-empty mutation count from K5 remains one. Pass when unchanged.
8. **K8 — No leaked or unsafe copy.** In `#blocked-generation-reason`, `#blocked-generation-announcement`, and `#blocked-generation-reference`, assert absence of every canary. Also assert absence of `MODERATION_BLOCKED`, `sk-`, `OPENAI`, `<script`, and the case-insensitive phrases `try again`, `retry`, and `resubmit`. Exclude the preserved objective; it is byte-for-byte teacher text and may contain "retry". Pass when every absence holds.
9. **K9 — Tab reaches the action.** With focus on the heading, press Tab once. Active focus is `#revise-request`. No element inside `#blocked-generation` has a `tabindex` greater than zero. Pass when both hold.
10. **K10 — Enter and Space activate.** Focus `#revise-request`. Press Enter: active focus is `#lesson-prompt`. Reset the fixture, focus `#revise-request`, press Space: active focus is `#lesson-prompt`. The action is a native `BUTTON` with `type="button"`. Pass when both keys and both element facts hold.
11. **K11 — No modal trap.** While the panel is visible, no element in the document has `role="dialog"` or `aria-modal="true"`. Shift+Tab from the heading moves focus outside `#blocked-generation`. Tab from `#revise-request` moves focus outside. Shift+Tab from `#revise-request` also moves outside, because the heading is not a tab stop. Pass when all four hold.
12. **K12 — Return focus.** Activate `Revise request` with Enter. `document.activeElement` is `textarea#lesson-prompt`. Pass when exact.
13. **K13 — Caret at end.** After K12, `selectionStart === selectionEnd === value.length`. Pass when exact.
14. **K14 — Text intact.** After K12, the textarea value equals the exact pre-submit string, including leading and trailing whitespace and newlines. Pass when the strings are equal with no trim or normalization.
15. **K15 — Newer text wins.** While the request is in flight, replace the field value with a different string. After the block, activate `Revise request`. The field keeps the newer string, not the blocked snapshot, with the caret at the end. The field is editable, and typing appends. Pass when all four hold.
16. **K16 — Field focus is visible.** After K12, measure the textarea's focus indicator. Accept an `outline-style` other than `none` with `outline-width` at least 2 CSS pixels. Also accept a changed `border-block-end-color` or `box-shadow`. The present indicator reaches at least 3:1 contrast against the adjacent background. Pass when both thresholds hold.
17. **K17 — Input block.** With the input-block fixture, the count of `section[aria-label="Generated lesson variants"]` is zero, and K10 through K16 pass. Pass when all hold.
18. **K18 — Prior draft preserved.** With the output-block fixture, capture the draft region element handle and its text. Also capture the selected variant and the preview scroll position before the block. After the block, the same handle is connected and its text is unchanged. The same variant remains `aria-selected="true"`. The scroll position differs by at most one CSS pixel. Pass when all four hold.
19. **K19 — Draft does not take entry focus.** On output-block appearance, active focus is `#blocked-generation-heading`, and no element inside the draft region or `section.a2ui-preview` has focus. Pass when both hold.
20. **K20 — Editing does not discard the draft.** After K18, activate `Revise request`, type one character, and wait one second. The draft element remains connected with the same text and selection, and the preview remains visible. Pass when all hold.
21. **K21 — Keyboard-only end-to-end.** From a fresh page, use only keyboard events. Reach `#lesson-prompt` and replace its value with a blocked objective. Tab to the create button and press Enter. Wait for the panel and assert heading focus. Tab to `Revise request` and press Enter. Assert field focus, caret at end, and text intact. Pass when every assertion holds and no pointer event was dispatched.
22. **K26 — Action focus is visible.** With `#revise-request` focused by Tab, measure its focus indicator. Accept an `outline-style` other than `none` with `outline-width` at least 2 CSS pixels. Also accept a changed `border-color` or `box-shadow`. The present indicator reaches at least 3:1 contrast against the adjacent background. Pass when both thresholds hold.
23. **K27 — Revision-required error maps to the panel.** Fulfill the generate route with an error response that carries `MODERATION_REVISION_REQUIRED`. The same panel appears with heading focus, one announcement equal to the visible reason, and `Revise request` as the only action. Pass when all four hold.

A passing DOM check does not prove screen-reader speech. Record actual assistive-technology behavior separately under #10 or #9; do not claim it from these checks.
