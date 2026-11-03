---
target: redesign sketches
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:/mnt/f32b06de-7703-4583-ba3f-b589b79c0001/home/abdullah/personal/edu-canvas/.impeccable/mocks/screens/index.html"
target_fingerprint: "sha256:bba844b71c0f32b3bd3664e3cb61e108b03e658d1409011679724e82e296749b"
target_path: /mnt/f32b06de-7703-4583-ba3f-b589b79c0001/home/abdullah/personal/edu-canvas/.impeccable/mocks/screens/index.html
timestamp: 2026-11-02T23-32-32Z
slug: impeccable-mocks-screens-index-html
---
# Critique run 3: Edu-Canvas redesign sketches

Target: `.impeccable/mocks/screens/index.html` — the nine redesign sketches the
rebuild is about to be built from. Method: dual-agent (A: design review, B:
detector + browser evidence), run independently.

## Design Health Score

| # | Heuristic | Score | Key issue |
| --- | --- | --- | --- |
| 1 | Visibility of system status | 3 | Approval progress ("1 of 4 approved") exists only in the tablist's accessible name (`2-review.html:304`); sighted teachers never see it. |
| 2 | Match system / real world | 3 | Teacher-real vocabulary undercut by A/B/C/D letters (`2-review.html:312`), and one action named three ways: "Draft again" (`1-studio.html:183`), "Retry variant" (`:341`), "Cancel" (`:358`). |
| 3 | User control and freedom | 2 | The attestation "My edit still fits…" is pre-ticked (`2-review.html:423`); "Discard edit, go back to version 1" is an unstyled chip with no confirm (`:407`); no undo for "Draft again". |
| 4 | Consistency and standards | 2 | Class 4B is 26 learners on Publish (`3-publish.html:229`) and 24 on the Dashboard (`4-dashboard.html:220`); ✓ marks an ungraded student pair (`7-learn.html:74`). |
| 5 | Error prevention | 3 | Genuinely good — blocked variants cannot be assigned (`3-publish.html:213`) — undone by "Assign to all 26" being live while its select reads "Choose a variant…" (`:245`), and by the pre-ticked acknowledgement. |
| 6 | Recognition over recall | 2 | The gap warning must be carried across four cards (`1-studio.html:220`); what each student actually gets is 13px (`:258`), and the student view is never shown at the point of decision. |
| 7 | Flexibility and efficiency | 2 | 21 of 26 learners hide behind "Show all 26 learners" (`3-publish.html:349`); no unassigned filter, no group assign, no duplicate-previous. |
| 8 | Aesthetic and minimalist design | 3 | Studio is a variant board, a full composer form and a banner on one page (`1-studio.html:365–547`); Publish presents four groups for one decision. |
| 9 | Error recovery | 4 | The best axis in the set: named file, named pages, named retry count, explicit "what is safe" (`6-errors.html:290–296, 259–264`); six distinct login failures each with an action (`8-state-matrix.html:172–211`). |
| 10 | Help and documentation | 2 | "Why was this blocked?" is `href="#"` (`6-errors.html:234`); "grounded" and `4.NF.A.1` are never explained where they matter. |
| **Total** |  | **26/40** | **Acceptable (mid-band)** |

## Design Specificity Verdict

**LLM assessment.** The system is disciplined and internally consistent: one 4px
rhythm, a serif/sans split that is actually honoured, status colour that always
travels with a word (`base.css:446`), and focus, forced-colors and reduced-motion
handled. It reads as a competent, calm 2025 SaaS system, and the copy inside it is
better than the system around it. But every teacher screen is the same shape — 56px
bar, serif `h1`, 62ch lede, white 14px-radius card with rows. Studio, Review,
Publish, Dashboard, Sign-in and the error catalogue are one template at different
fill levels. A product named **Edu-Canvas** contains no canvas, no board, no
arrangement of work; the only board in the set belongs to the student
(`7-learn.html:166`). The palette (warm off-white, clay, Source Serif 4 + Figtree,
999px pills) is the house style of every AI writing tool of the last two years —
the lede even names the borrowing ("the Frametell-style composer card",
`index.html:64–66`).

Specificity lives in the sentences and in exactly two artifacts: the fraction-bar
SVG and the before/here/next learning path (`2-review.html:521–551`). Clay does
seven jobs — primary button, italic `h1`, links, focus ring, avatar, current-path
dot, selected student tile — so "one clay accent" carries no meaning
(`base.css:227, 292, 361, 423`). The one thing that is unmistakably this product,
the teacher trust boundary, is rendered as a 13px grey line under the CTA
(`0-landing.html:231–246`) and as a 320px sticky strip inside the review column
(`2-review.html:417–444`).

**Deterministic scan.** Under the project config the CLI scan exits 0 with **0
findings** — because `.impeccable/config.json` suppresses `cream-palette` and
`flat-type-hierarchy` for exactly these files. With `--no-config` the same scan
exits 2 with **18 findings + 2 advisory**: `cream-palette` on all 10 files (page
background `rgb(248, 246, 242)`) and `flat-type-hierarchy` on all 10. Judgement:
the cream finding is a **false positive** — a confirmed theme decision, expressed
as the `--ground` token, not an ad-hoc value. The `flat-type-hierarchy` headline
claim (`h1 16px`) is **false**: the static parser never resolves `base.css`, and
the rendered `h1` is 32–70.4px serif. But the rule is half right for a different
reason: `h2` renders at body size on `2-review`, `3-publish` and `7-learn`, and
`.h2` is **13px, below body 16px** on `1-studio`. The CDP scan of the rendered
index returns 1 finding under `--no-config` (cream, attributed to `body`, though
the colour is on `html` at `base.css:52–58`).

**Visual overlays.** None. No browser automation tool is exposed in this session,
so the detector overlay could not be injected or presented — there is no
`[Human]` tab and no user-visible overlay. Fallback signal: headless Chrome over
CDP plus 1440px screenshots of all ten pages.

## Overall Impression

Craft above category, and the trust/recovery writing is genuinely better than
average. The decision moments are where it falls down: the product's differentiator
is approval, and approval is the quietest thing on the review screen, with one of
its two judgements already made for the teacher. The single biggest opportunity is
to stop treating the trust boundary as a footnote and make it the loudest object
in the app.

## What's Working

1. **Recovery writing that names the object.** "Pages 3–4 of 'Fractions unit.pdf'
   have no readable text"; "We tried twice. Edu-Canvas won't draft from memory
   alone" (`6-errors.html:290–296, 259–264`). Every state says what happened, what
   is safe, and what to do next. This survives a rebuild intact.
2. **The dashboard turns the prerequisite path into an operational fact.** "A 6 ·
   B 4 · D 14" beside "19 finished · 16 ready for 4.NF.A.2 · 3 need another go"
   (`4-dashboard.html:220–223`) is the product thesis expressed as a table row a
   teacher can act on — not decorative analytics.
3. **Status never relies on colour alone, and every variant says what the student
   gets.** The rule is stated at `base.css:446` and honoured throughout; "Students
   get: nothing. Blocked variants can't be assigned." (`1-studio.html:336–338`) is
   the most product-specific sentence in the set.

## Priority Issues

### [P0] The approve gate has no gravity, and one attestation is pre-ticked
`2-review.html:417–444`, with the checkbox `checked` at `:423`. The differentiator
is the trust boundary, yet the irreversible act is a grey strip inside the document
column with 13px rationale, and "My edit still fits 'Check for understanding'" is
already ticked — the teacher never makes the judgement the boundary exists to
guarantee. At 9pm this is a rubber stamp on 24 children's screens.
**Fix:** make it a full-width anchored panel outside the scroll column; untick every
attestation; put the consequence on the button ("Approve version 2 — 24 learners");
show "1 of 4 approved" as visible text; keep the version-stamp line.
**Command:** `$impeccable bolder`

### [P0] Publish silently decides an open product question
`3-publish.html:385–391` offers "Copy all 24 links", each opening one learner's
variant. PRODUCT.md says where students do the work is undecided — shared classroom
devices, projector, or home. A design that only produces 24 personal links makes
that decision by accident and hands a teacher 24 things to distribute on a Monday.
**Fix:** offer a class join code alongside per-learner links, and a projector /
large-type state; state the assumption on the page rather than in a footnote.
**Command:** `$impeccable shape`

### [P1] There is no flow spine; five teacher screens are pages, not steps
Studio → Review → Publish each re-establish context in the `h1` ("Equivalent
fractions" / "Review · Equivalent fractions" / "Publish equivalent fractions");
breadcrumbs exist on two of four (`2-review.html:292`, `3-publish.html:175`) and not
on Studio or Dashboard; "Review" is a top-level nav item (`1-studio.html:152–156`)
even though review is per-lesson. A teacher who loses the thread cannot see "variant
2 of 4, step 3 of 5".
**Fix:** one lesson shell with persistent step state (Draft · Review 1 of 4 ·
Publish) and a single forward action; drop "Review" from global nav.
**Command:** `$impeccable layout`

### [P1] The learner surface congratulates before the server grades
`7-learn.html:74, 172–190`: a ✓ and "Pair 1" appear the moment a pair is made, before
the server grades anything; `aria-current="true"` at `:195` is announced as
"current", not "selected"; fractions are slash text ("1/2", "2/4", "4/10") for
readers aged 8–11 on a fractions lesson; and a stuck child has no exit until all four
pairs are made (`:237–239`).
**Fix:** neutral pair icon until Done; `aria-pressed` on tiles; stacked numerals or a
bar glyph inside each tile; a learner type scale that is not the teacher's editorial
serif; a "I'm stuck" affordance.
**Command:** `$impeccable harden`

### [P1] Control boundaries and disabled states fail WCAG 1.4.11 in the rendered CSS
`.field input` is bounded by a 1px `#d6cfc3` border on `#ffffff` — **1.55:1**
against its own fill, 1.43:1 against the ground (`base.css:416`), where 3:1 is
required. On focus, `outline: none` is replaced by a **1.21:1** halo
(`base.css:421–424`); only the border change to clay (4.98:1) carries the state.
Separately, 8 controls use native `disabled` (`8-state-matrix.html:168, 238, 258,
414`, `1-studio.html:409, 421, 430`, `5-sign-in.html:185`) even though `base.css:830`
documents `aria-disabled` precisely so keyboard and screen-reader users can hear
why — the disabled grade radios even carry `aria-describedby` that can never be
announced. Busy states are `aria-hidden` spinners with no `aria-busy` on the two
submitting buttons.
**Fix:** raise the field border to ≥3:1, give the focus halo ≥3:1 or keep a 2px
outline, switch disabled actions to `aria-disabled="true"`, and put `aria-busy` on
submitting buttons.
**Command:** `$impeccable audit`

## Persona Red Flags

**Alex (power user).** Publish hides 21 of 26 learners behind one button
(`3-publish.html:349`) with no unassigned filter and no keyboard path through 26
selects. "Assign to all 26" is enabled while its select reads "Choose a variant…"
(`:245–251`). "See results" goes to `#` (`4-dashboard.html:165`), so Alex exports
nothing and rebuilds the data in a spreadsheet.

**Sam (screen reader / keyboard).** The tablist declares `aria-controls="p-b"`,
`"p-c"`, `"p-d"` (`2-review.html:320, 331, 340`) but only `id="p-a"` exists (`:351`) —
three tabs announce panels that are not there. `aria-current="true"` on the 1/3 tile
(`7-learn.html:195`) announces "current" instead of selected. The approval count is
aria-only (`2-review.html:304`), so Sam has information the sighted teacher does not,
while the sighted teacher has a pre-ticked box Sam is told to untick.

**Jordan (first-timer).** Opens Studio with drafts present and finds "Four variants to
review" followed 1800px later by a complete "New lesson" composer (`1-studio.html:365–547`);
cannot tell whether they are reviewing or starting. Three words for one action: "Draft
again" (`:183`), "Retry variant" (`:341`), "Cancel" (`:358`). The A/B/C/D letters carry
meaning Jordan has to learn.

**9pm tired teacher.** The two facts that gate an irreversible publish — "Two learners
have no variant yet" and "1 check left" — are 13px under 26 rows (`3-publish.html:352`,
`2-review.html:439`). Class size contradicts itself between screens (26 vs 24), so the
number on the button cannot be trusted. The sign-in page presents two validation errors
and a countdown at once (`5-sign-in.html:103–153, 187`).

## Minor Observations

- Class 4B is 26 learners on Publish (`3-publish.html:229`) and 24 on the Dashboard
  (`4-dashboard.html:220`); 6+4+14=24, so the dashboard is the wrong one.
- `1-studio.html:220–221` promises "Each variant marks where that shows"; no card
  carries a gap marker.
- "Search lessons" is a styled `<span>` with `tabIndex=-1` and no role
  (`4-dashboard.html:186–199`) — there are zero `<input>` elements on the page.
- Page titles follow four patterns: "Equivalent fractions", "Review · Equivalent
  fractions", "Publish equivalent fractions", "Your lessons".
- The Review rail repeats Studio's standard-match checks verbatim
  (`2-review.html:465–513`) — the duplicate occupies the space a student preview
  should have.
- `.v h3` clamps to 2 lines and `.v p` to 3 (`base.css:599–615`) with no expand, on
  the primary comparison surface (nothing is actually cut at current copy lengths).
- The approve legend hardcodes a count: "needs two checks" (`2-review.html:420`).
- `--fs-stat` (`base.css:9`) is a dead token.
- `html { font-size: var(--fs-body-lg) }` (`7-learn.html:9–11`) rescales every rem
  token globally instead of defining a learner scale.
- "Resend in 24 s" appears where the label says 30 s (`5-sign-in.html:187`,
  `8-state-matrix.html:235–238`), and one screen hardcodes "Checking again in 15 s"
  (`6-errors.html:328`).
- No state exists for all four variants blocked, or for a publish/assign failure —
  the two failures most likely to end a teacher's evening.
- The state matrix lacks: empty search, zero learners in a class, upload in progress,
  and an edit conflict when a section is edited twice.
- `.done` names two unrelated things (publish success, student submit).
- The logo is a generic `+` (`base.css:47–57`); nothing in mark or palette touches
  canvas, fractions, or teaching.

## Questions to Consider

1. If A, B and D all end in "then matching (4 pairs)" (`1-studio.html:258, 302, 355`)
   and the only learner screen is the matching board, what is the teacher choosing
   between — pedagogy, or three introductions to identical student work? Would one
   excellent activity the teacher can vary beat four variants that converge?
2. The trust boundary is the differentiator, yet approval is a grey strip with a
   pre-ticked box. What would this product look like if approval were the loudest
   object in the app — a signed record of what changed, who approved it, and exactly
   which children received which version?
3. PRODUCT.md says student device context is undecided, so why does Publish already
   produce 24 personal links? What does publish look like for a projector, or a shared
   cart of six tablets — and what changes if that is the primary case, not the fallback?
