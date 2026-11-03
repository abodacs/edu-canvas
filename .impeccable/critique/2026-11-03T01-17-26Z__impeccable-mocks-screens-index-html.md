---
target: redesign sketches
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/mnt/f32b06de-7703-4583-ba3f-b589b79c0001/home/abdullah/personal/edu-canvas/.claude/worktrees/ux-revamp/.impeccable/mocks/screens/index.html"
target_fingerprint: "sha256:324d5fa9ee2472a19f889d93e2063c101ff70cdfa7023969cb1575cd678daaa8"
target_path: /mnt/f32b06de-7703-4583-ba3f-b589b79c0001/home/abdullah/personal/edu-canvas/.claude/worktrees/ux-revamp/.impeccable/mocks/screens/index.html
timestamp: 2026-11-03T01-17-26Z
slug: impeccable-mocks-screens-index-html
---
# Critique run 4: Edu-Canvas redesign sketches (post-revision)

Target: `.impeccable/mocks/screens/index.html` in `worktree-ux-revamp`, after the
clay-rule, approve-gate, lesson-spine, learner-board and accessibility pass.
Method: dual-agent (A: design review, B: detector + browser evidence).

## Design Health Score

| # | Heuristic | Score | Key issue |
| --- | --- | --- | --- |
| 1 | Visibility of system status | 3 | Counters are invented, not derived: "3 of 4 ready" sits above two ready, one blocked and one drafting card (`1-studio.html:205`), and "1 check left" sits above two **unticked** boxes followed by "Both confirmations unlock approval" (`2-review.html:566`). |
| 2 | Match system / real world | 3 | Teacher-real copy throughout, then engineering leaks: "gap G1" and "gap G4" in teacher-facing sentences (`3-publish.html:262`, `:328`). |
| 3 | User control and freedom | 3 | Real exits now — "Discard edit, go back to version 1" (`2-review.html:421`), "Cancel draft" (`1-studio.html:383`), "I'm stuck" (`7-learn.html:263`). Missing an unsaved-edit guard once the composer collapses. |
| 4 | Consistency and standards | 2 | Three disabled dialects (filled, dashed, unstyled); the same state is "Ready to review" (`1-studio.html:286`), "Ready · 1 warning" (`2-review.html:344`) and "Draft"/"New lesson" in the spine and nav; 3 of 4 variant rail links resolve to nothing. |
| 5 | Error prevention | 3 | The gate is genuine prevention — two unticked attestations, `aria-disabled` with a reason (`2-review.html:552-568`). Undercut by `aria-disabled` radios that stay arrow-key selectable (`1-studio.html:433`, `3-publish.html:251`). |
| 6 | Recognition over recall | 2 | Both attestations ask the teacher to remember evidence that is 3+ screens away on a phone (`2-review.html:552-559` vs `:499-535`). |
| 7 | Flexibility and efficiency | 2 | Four variants mean four navigations; the rail costs 4 tab stops before the document; no side-by-side compare. |
| 8 | Aesthetic and minimalist design | 3 | Type and density are above the category. But 23 clay primaries for a rule that permits three verbs. |
| 9 | Diagnose and recover from errors | 3 | The best writing in the set (`6-errors.html:258-263`). "Why was this blocked?" is still `href="#"` (`:233`). |
| 10 | Help and documentation | 2 | Inline definitions are good; "Why was this blocked?", "I'm stuck" and the results destination have no designed endpoint. |
| **Total** |  | **26/40** | **Acceptable (low end)** |

## Design Specificity Verdict

**LLM assessment.** The middle of the flow is now authored for this product. The
**seal** — a 2px-ink panel outside the document, holding two unticked
attestations, a plain-language statement of what approval freezes, and a
disabled button that explains itself (`2-review.html:540-571`) — reads as a
stamp, not a card. **"Students get:"** on every variant (`1-studio.html:281-283`)
answers "what will my class actually see" in one sentence and does not survive a
template. The **evidence sidebar** treats gaps as first-class citizens, and the
**learner board** — stacked fractions at 34px, numbered pairs instead of ticks,
two columns preserved at 390 — looks like a maths classroom.

The edges are still interchangeable: the landing hero, the four-card loop, the
three-up auth sheet, the dashboard table and the 2×2 error grid could carry any
2025 curriculum-AI product. The serif-plus-warm-neutral-plus-cards system is
well executed but it is the category's house style.

The **clay rule is a claim the render does not yet support.** `index.html:62-66`
states one rule with three verbs; 23 elements carry the clay `.btn`, of which
about five map to approve, publish or sign in. "Review variants"
(`1-studio.html:206`), "New lesson" (`4-dashboard.html:143`), "Replace file"
(`6-errors.html:297`) and "Create lesson" (`1-studio.html:554`) are all clay,
because clay is the default `.btn` (`base.css:311`). And on the one screen where
the rule must be proved, the approve button is disabled beige — the commitment
colour never appears where a commitment happens.

**Deterministic scan.** Under the project config the CLI exits 0 with **0
findings**; the config suppresses `cream-palette` for the whole directory and
`flat-type-hierarchy` for every page. With `--no-config`: exit 2, **18
findings** — 10 × `cream-palette` (a recorded, deliberate theme decision) and
8 × `flat-type-hierarchy`, which is a **false positive**: the static parser
cannot resolve `base.css`, and the rendered step is body 16px → h2 26px, a
1.63× step. The rendered scan (CDP) reports two real findings the static scan
cannot see: `line-length` on the index (`.lede` at `62ch` renders ~91 characters,
`base.css:257`) and `italic-serif-display` on the landing, which is **half
false** — only the `<em>understand</em>` is italic, 15% of the h1.

**Visual overlays.** None. No browser automation tool is exposed in this
session, so the detector overlay could not be injected or presented. Fallback
signal: headless Chrome over CDP plus 1440/390/320 captures.

## Overall Impression

The craft is above the band; the score is dragged down by state arithmetic,
control-state dialects and one broken focus target — not by the design idea.
The seal and the learner board are the two artifacts worth protecting through
the rebuild.

## What's Working

1. **The seal makes the trust boundary a physical object.** It has an edge, it
   sits outside the document, it is the only 2px frame on the page, it states
   version immutability, and it explains why the button is disabled. This is the
   most product-specific artifact in the set.
2. **"Students get:" on every variant.** One sentence of consequence per option
   with the preview one click away (`1-studio.html:281-283`). It removes a whole
   class of "what does this actually do" anxiety.
3. **The error copy system.** "We tried twice. Edu-Canvas won't draft from
   memory alone" (`6-errors.html:258-263`) states a product principle as an
   actionable sentence.

## Priority Issues

### [P0] The lesson composer has no visible focus
`1-studio.html:77-79` sets `outline: none` on a borderless, transparent
textarea, and that rule beats the global `:focus-visible` ring. Measured on the
focused element: `outline-style: none`, no box-shadow, no border — a pixel probe
finds nothing darker than the page ground outside its edge. The primary input of
the primary flow is indistinguishable from static text while focused. WCAG 2.4.7.
**Fix:** delete the override; put the ring on `.write:focus-within` so the whole
composer reads as one focus target.
**Command:** `$impeccable harden`

### [P1] The review screen's state is invented
"1 check left" above two unticked boxes, then "Both confirmations unlock
approval" (`2-review.html:552-566`) — the teacher ticks one, the button stays
disabled, and learns the number is decoration. "1 of 4 approved" is painted
`ok`-green as if one quarter were success (`:331`). And 3 of 4 rail links point
at `#panel-b/-c/-d`, which do not exist (`:342, :348, :354`; only `id="panel-a"`
at `:364`) — worse than the tablist they replaced, because a tab at least
switched panels.
**Fix:** derive the count from the checkbox state ("2 confirmations left"), keep
the count neutral until 4/4, and make the rail items resolve — either real
panels or links to the shown variant.
**Command:** `$impeccable clarify`

### [P1] The product cannot say whether it is one learner or a class
Publish says "One publication reaches one learner" (`3-publish.html:281`) and
"Today only one learner link can be issued" (`:259`), while the same screen lists
"6 learners / 4 learners / 14 learners" per variant (`:220-233`), the dashboard
shows "Class 4B · 26 learners · A 6 · B 4 · D 14" (`4-dashboard.html:236`), and
the landing promises "assign one to each learner" (`0-landing.html:246`). The
single-learner constraint is stated once and contradicted three times. And the
assign block has no variant selector: the teacher picks Omar and publishes
without ever choosing which variant Omar receives.
**Fix:** adopt the single-learner wedge across publish, dashboard and landing,
and add the variant selector to the assign block.
**Command:** `$impeccable shape`

### [P2] Control states speak three dialects, and one speaks none
Disabled buttons are filled (`base.css:966`), ghosts and chips are dashed
(`:371`, `:999`), and `.link[aria-disabled]` has no rule at all — so "Resend in
24 s" renders as a live black underlined link on sign-in (`5-sign-in.html:208`)
while the same control is a faded dashed ghost in the state matrix
(`8-state-matrix.html:238`). `aria-disabled` radios remain selectable
(`1-studio.html:433`, `3-publish.html:251`).
**Fix:** one disabled recipe for every control, native `disabled` on radios with
a visible group note, and a `.link[aria-disabled]` treatment.
**Command:** `$impeccable polish`

### [P2] Clay is not yet a rule
23 clay primaries; about five qualify. On the learner board the student's only
commit ("Done") is clay while a practice action is ink (`7-learn.html:259, 304`)
— the rule's own hierarchy inverted on the surface it was written for.
**Fix:** make the base button neutral and `.btn.clay` opt-in for approve and
publish only; move Done to ink and the retry to secondary.
**Command:** `$impeccable polish`

## Persona Red Flags

**Alex (power user).** Four variants = four navigations, no arrow-key switching,
no side-by-side. Tab order on Review is 2 nav + 3 crumbs + 3 steps + 4 rail links
before the document. The only glanceable number on Studio ("3 of 4 ready") is
wrong, so Alex learns not to trust it.

**Sam (screen reader / keyboard).** The composer has no focus ring. Eight
learner tiles announce three different control types (paired tiles carry no
`aria-pressed` at all). "English" is never announced — `aria-labelledby="l"` on
the paragraph replaces its own text (`1-studio.html:463-466`). Three rail links
are dead. "Resend in 24 s" is announced as an available link. Every fraction is
read as a slash.

**Jordan (first-timer).** "Approval is the trust boundary" defines a term with a
term. "My edit still fits 'Check for understanding'" is unparseable without
knowing the section list. "Ready", "Ready to review", "Ready · 1 warning" and
"Gap · unit fractions" are four labels for two facts.

**9pm tired teacher.** The wrong count is the moment they give up: one box
ticked, button still beige, no explanation. On mobile the attestation is three
screens below its evidence. The second "Needs you" item ends at `href="#"`
(`4-dashboard.html:177`).

## Minor Observations

- `:focus-visible` sets `border-radius: 6px`, so a focused card visibly changes
  corner radius (`base.css:76-80`).
- The signed-out banner is `ok`-green with a checkmark — it reads as success
  (`0-landing.html:196-210`).
- Loop cards 1 and 3 carry ~90px of dead space because card 2 sets the row
  height; the three most interesting words ("Your call", "Automatic", "After you
  publish") are the smallest type on the page.
- The hero wraps to four lines and splits "learning / objective".
- The publish fieldset legend collides with its own top border at 390.
- `8-state-matrix.html:106` still uses `--line-strong` (~1.6:1) for its mini
  field, so the state matrix does not match the real fields.
- `6-errors.html:81,84` uses raw hex instead of tokens.
- Dashboard filter chips: one `aria-pressed="true"`, two with no state.
- The "Check your inbox" notice lives inside the **/login** card, not /sign-up.
- The learner header shows the bare word "Maple" with no label.
- No design exists for `failed-retryable` or `failed-terminal`, though the index
  claims Studio covers them.
- German strings used to stress translation while Arabic is the recorded
  deferred locale.

## Questions to Consider

1. If approval is the trust boundary, why is the proof a count? The seal knows
   the version; it could show the artifact it freezes — variant, version, checks
   passed, who can receive it.
2. One learner or 26? Until publish, the dashboard and the landing give the same
   answer, the trust story has a hole a teacher can see from the dashboard.
3. If clay is already on "Review variants", "New lesson" and "Replace file", what
   is left for the approve button to say?
