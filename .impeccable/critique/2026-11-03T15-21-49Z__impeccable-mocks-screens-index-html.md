---
target: redesign sketches
total_score: 30
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:/mnt/f32b06de-7703-4583-ba3f-b589b79c0001/home/abdullah/personal/edu-canvas/.claude/worktrees/ux-revamp/.impeccable/mocks/screens/index.html"
target_fingerprint: "sha256:bfc10c27ddb793332fe77e5b40b67094cffc0357d0e6380268f3f5412d2269a7"
target_path: /mnt/f32b06de-7703-4583-ba3f-b589b79c0001/home/abdullah/personal/edu-canvas/.claude/worktrees/ux-revamp/.impeccable/mocks/screens/index.html
timestamp: 2026-11-03T15-21-49Z
slug: impeccable-mocks-screens-index-html
---

# Critique run 5: Edu-Canvas redesign sketches (post-fix)

Target: `.impeccable/mocks/screens/index.html` in `worktree-ux-revamp`, after the state-truth, single-learner, disabled-state, clay-rule and accessibility pass. Method: dual-agent (A: design review, B: detector + browser evidence).

## Design Health Score

| # | Heuristic | Score | Key issue |
| --- | --- | --- | --- |
| 1 | Visibility of system status | 3 | Progress still reads as success: "1 of 4 approved" is painted `ok` at 25%, and four rail links all resolve to the same panel, so status is visible but not navigable. |
| 2 | Match system / real world | 3 | Teacher-real language throughout, but tracker IDs leak into copy: "need class assignment (G1)" (`3-publish.html:256`), "gap G4" (`:331`), "the S8 target" (`4-dashboard.html:284`). |
| 3 | User control and freedom | 3 | Good escapes everywhere; but a teacher cannot see the other three variants before approving one. |
| 4 | Consistency and standards | 2 | "Ready to review" is green (`1-studio.html:290`) while "Ready · 1 warning" is amber (`:335`); trust-critical actions are 13px links while cosmetic ones are 36px pills; two disabled text colours remain. |
| 5 | Error prevention | 4 | The gate derives its confirmations from the actual risks, the button is disabled with the reason attached (`2-review.html:552-571`), publish restates the exact act (`3-publish.html:297`), blocked variants cannot be assigned. |
| 6 | Recognition over recall | 3 | "Students get:" and per-variant status words remove recall; versions are never compared, and "1 warning" must be re-found at the gate. |
| 7 | Flexibility and efficiency | 2 | Nothing for a second-time user: no compare, no bulk approve, no duplicate, no shortcut; "Review 4 drafts" is one row for four items. |
| 8 | Aesthetic and minimalist design | 3 | Refined type and drawn diagrams, but the landing puts a clay button, a 2px-ink box and a card in one column, so three objects shout equally. |
| 9 | Diagnose and recover from errors | 4 | Every state names what is safe, then one action (`6-errors.html:260`, `8-state-matrix.html:439`). |
| 10 | Help and documentation | 3 | Excellent in-context help; no help entry point and no first-use definition of "variant". |
| **Total** |  | **30/40** | **Good (low end)** |

## Design Specificity Verdict

**LLM assessment.** Authored in its information design, borrowed in its surface. Product-specific and not portable: the evidence column pairs checks with a named gap in the same list (`2-review.html:451-499`); the learning path as Before / This lesson / Next with standard codes (`:507-537`); a gate that requires confirming _the specific edit_ and _the specific gap_ (`:552-561`); the learner board's drawn bars, "Pair 1" badges and plain-language result (`7-learn.html:299-302`); and "Edu-Canvas won't draft from memory alone" (`6-errors.html:260`).

Category-interchangeable: warm cream ground, serif display, one terracotta accent, 14px cards, pill statuses. The hero + four-step loop + CTA close is a template with a product-specific sentence dropped in; the dashboard is a generic "needs attention / all items" table that would survive a swap to invoices. The specificity lives in the words and the data model; the drawing — the bar and its cut — is the one mark nobody else has and it is still only illustration, never structure.

The clay rule, as now written, is close but not yet true: the render obeys the button half and breaks "each state gets one". Selection also uses clay (filter chips, mode chips, school picker, checkbox accent, caret), the landing has two clay actions in one viewport, and Review has none because its forward action is disabled. The rule must either absorb the disabled case and exclude selection, or be restated as "clay is the accent".

**Deterministic scan.** Under project config: exit 0, 0 findings — but only because the config waives `cream-palette` for the directory and `flat-type-hierarchy` for every page. With `--no-config`: exit 2, **18 findings** — 10 × cream (deliberate) and 8 × flat-type, a **false positive** (the static parser never resolves `base.css`; rendered body 16 → h2 20–26 → h1 32–70.4). The rendered scan adds `italic-serif-display` on the landing, also false: the h1 computes upright and only `<em>understand</em>` is italic.

The rendered pass surfaces what the static one missed: at **390px** the local clamps invert the hierarchy — `2-review` h1 24px against a 26px h2 (0.92), and `1-studio` h1 28 against 26 (1.08).

**Visual overlays.** None. No browser automation tool is exposed, so the overlay could not be injected or presented. Fallback: headless Chrome over CDP plus 1440/390/320 captures.

## Overall Impression

Craft is high; rule integrity is the weak seam. Two of the index's three stated rules are false in the render, the accent means three things, and the one accessibility fix in the previous pass introduced a visible regression. The information design — the gate, "Students get:", the learner result — is worth protecting through the rebuild.

## What's Working

1. **The trust boundary is an object.** The 2px-ink seal, state-derived confirmations and the version record let a teacher point at what protects the child. The separate approved-state card teaches the distinction without a tooltip.
2. **Error copy that respects the reader.** "We tried twice. Edu-Canvas won't draft from memory alone" states a product principle as a sentence; "Your pairs are still here. Tap Done to try again" does the same for a child.
3. **The learner result state.** It names the misconception, explains it with the same bars the child manipulated, offers one retry and one exit, and says who sees the result and what happens next.

## Priority Issues

### [P1] The accent has three meanings

Clay is the forward action (`base.css:310`), the selection state (`:421-426`, `:994-999`), and the input accent; it is absent in two of the three main-flow states. Fix: keep clay strictly for the forward action, move selected states to ink/sunk, and add the disabled case to the rule. **Command:** `$impeccable colorize`

### [P1] On a phone the approve gate was 1,810px down a static page

The CSS claimed "never below the fold" while switching to `position: static` below 960px. A teacher approving from a phone did it from memory. **Fix:** keep the gate sticky on phones, condensed to heading, confirmations and action. **Command:** `$impeccable layout`

### [P2] "1 of 4 approved" is a success pill at 25%

`2-review.html:332` used `pill ok`; the status told a tired teacher "done" three times too early. **Command:** `$impeccable clarify`

### [P2] Fractions typed as slashes in the artifact used to judge lesson quality

The rule said "a fraction is drawn, never typed as a slash", yet the document preview renders `1/2`, `2/4`, `3/6` in prose. Either use the `.frac` component in the document or scope the rule to the learner surface. **Command:** `$impeccable typeset`

### [P3] The learner's exits were the smallest targets on the screen

"Try that pair again" was a 44px clay button while "I'm finished for now" was a 13px link; the escape hatch should not be the hardest thing to hit. **Command:** `$impeccable adapt`

## Persona Red Flags

**Alex (power user).** No compare: the rail is four links to one document, so the one efficiency that matters at volume is missing. "Review 4 drafts" hides which four. "Draft again" silently replaces unapproved variants and its explanation is a 13px hint below the control.

**Sam (screen reader / keyboard).** The composer double-ringed (now fixed). The review document is a focusable `<article tabindex="0">` with no role — an extra tab stop that announces a title and nothing to do. Rail links announce `aria-current="page"` on a link that does not change page. "Saved" on the learner board is a plain span with no `role="status"`.

**Jordan (first-timer).** Studio shows a finished lesson and an empty composer on one scroll, separated by a 12px grey label. "Four variants to review" never says what a variant is. Publish is where he learns the product cannot assign a class.

**9pm tired teacher.** Must hold three status words, two amber notices, two confirmations and a four-line trust paragraph at once, with the evidence in two other regions. The gate's black border plus amber "Not approved yet" reads as "you may have done something wrong".

## Minor Observations

- The idle sign-out banner in `6-errors.html` was the darkest surface in the set for a routine two-minute timer.
- `2-review.html:568` has no partial form for one confirmation.
- "Draft again" is styled `btn secondary` while harmless "Edit objective" is a ghost — weight inverted relative to risk.
- `.none` cells were hidden at ≤720px, so "Not assigned" disappeared on a phone.
- "I'm stuck" sits after "Saved" and reads as one cluster.
- "Resend cooldown · 30 s" next to "Resend in 24 s" is a countdown, not a contradiction, but it reads like one.
- Every index row's pill is `idle`; "Main flow" appears four times, so the column carries no information.
- Inline style literals are the pattern these sketches hand to the rebuild.
- `0-landing.html` has a dead `counter-reset: s`.
- "Your call" / "Automatic" / "After you publish" is the clearest ownership signal in the set and the smallest type on the page.
- Gap codes G1/G4/S8 appear in shipped copy in four places.

## Questions to Consider

1. When the forward action is disabled, who carries "the next action"? Review is the most consequential screen and the only main-flow state with no clay.
2. Is class assignment actually on the roadmap before this is built? The dashboard's information architecture describes a product that cannot exist today.
3. At 9pm on a phone, is approval one scroll-and-confirm, or a bottom sheet over the document?
