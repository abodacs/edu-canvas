---
target: redesign sketches
total_score: 28
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
target_identity: "file:/mnt/f32b06de-7703-4583-ba3f-b589b79c0001/home/abdullah/personal/edu-canvas/.claude/worktrees/ux-revamp/.impeccable/mocks/screens/index.html"
target_fingerprint: "sha256:bfc10c27ddb793332fe77e5b40b67094cffc0357d0e6380268f3f5412d2269a7"
target_path: /mnt/f32b06de-7703-4583-ba3f-b589b79c0001/home/abdullah/personal/edu-canvas/.claude/worktrees/ux-revamp/.impeccable/mocks/screens/index.html
timestamp: 2026-11-03T16-15-35Z
slug: impeccable-mocks-screens-index-html
---

# Critique run 6: Edu-Canvas redesign sketches (accent and gate pass)

Target: `.impeccable/mocks/screens/index.html` in `worktree-ux-revamp`. Method: dual-agent (A: design review, B: detector + browser evidence), both at real viewport heights (1440×900, 390×844) rather than tall captures.

## Design Health Score

| # | Heuristic | Score | Key issue |
| --- | --- | --- | --- |
| 1 | Visibility of system status | 3 | Status in words is excellent; the gate count was a literal string with no partial state. |
| 2 | Match with the real world | 3 | Teacher vocabulary is clean, then leaks `503`, `G1`, `G4` and `moderation` into shipped copy. |
| 3 | User control and freedom | 3 | Undo is designed in; "Draft again" still wipes unapproved variants with no confirm. |
| 4 | Consistency and standards | 2 | The same lesson name rendered 32/38/52px across one flow; two disabled text colours. |
| 5 | Error prevention | 3 | Two confirmations plus a restated recipient is the best thing here; on phones the gate covered the section it asked about. |
| 6 | Recognition over recall | 3 | Rail and prerequisite path remove recall; the dashboard writes variants as bare letters. |
| 7 | Flexibility and efficiency | 2 | No compare, no bulk approve, no shortcut; "Review 4 drafts" is one row for four. |
| 8 | Aesthetic and minimalist design | 3 | Disciplined palette; "Draft again" explained three ways. |
| 9 | Error recognition and recovery | 3 | Copy names file, pages and next step; 403 and wrong-password are dead ends. |
| 10 | Help and documentation | 3 | Strong in context; the gate's only explanation was hidden under 960px. |
| **Total** |  | **28/40** | **Good** |

## Design Specificity Verdict

Authored information architecture, interchangeable surface. Authored: per-variant validation verdicts, `Not in the source: unit fractions (3.NF.A.1)` as a first-class object, Before / This lesson / Next, the immutability sentence, the `Needs you` queue. Interchangeable: warm ground, serif display, one rust accent, cards and pills — the palette and type could move to another product untouched.

The stated rules, judged against the render:

- **clay = forward action** — partly true. True on the main buttons; false where the queue has three equal secondaries and only "New lesson" is clay, where the empty state has two secondaries and no primary, and where a decorative pencil icon uses the accent.
- **selection = ink** — true everywhere.
- **disabled forward action carried by the gate frame** — false: the frame is identical in both states and no enabled state is drawn.
- **a fraction is drawn on the learner surface** — true on the board; the index's absolute "never typed as a slash" is false in ten prose instances, and every board item's accessible name is still a slash string.

## Deterministic scan

Under config: exit 0, 0 findings (two documented suppressions). Under `--no-config`: exit 2, 18 findings — 10 × `cream-palette` (deliberate) and 8 × `flat-type-hierarchy`, a false positive from the static parser not resolving `base.css` (rendered h1 32–70px, body 16px). The rendered scan adds `italic-serif-display` on the landing, half false: only `<em>understand</em>` is italic.

Rendered measurements: 0 horizontal overflow at 1440/390/320; 0 text pairs below 4.5:1; 0 dangling `aria-*`/`for`; one visible focus ring on the composer and on sign-in fields; no disabled control whose only change is the cursor.

## Priority Issues

### [P1] The sticky approve gate occluded what it asked the teacher to confirm

At 1440×900 it covered 80px (8.9 %) and at 390×844 132px (15.6 %); it overlapped the confirmation block at 32 and 44 scroll offsets, fully covering a checkbox and swallowing clicks in 11 and 16 of them. The rationale paragraph was also `display: none` under 960px, so the only explanation of the trust boundary disappeared exactly where the screen was hardest. **Fix:** confirmations belong to the document; the sticky element is an ~80px action bar with the heading, the count and the button.

### [P2] Publish drew the UA fieldset border through its own legend

`.mode` was a `<fieldset>` with no `border: 0`, so a 2px groove ran through "How the learner opens it". One line, on the second-most-important screen.

### [P2] The page-title role had four sizes and no owner

The same lesson name rendered 52px on Publish, 38px on Studio and 32px on Review, only 6px above Review's own h2. The mobile fix had been applied per file.

### [P2] Identifier and mobile-label leaks

`G1`, `G4`, `503` and `moderation` in teacher-facing copy; on phones the dashboard table lost its headers and the Status label sat on the pill rather than the cell.

### [P2] "Needs you" was a queue with no primary

Three equal secondaries and a clay "New lesson" above them, so the screen steered toward creating work rather than clearing it.

## Persona Red Flags

**Alex.** No accelerators; four variants mean four navigations; "Draft again" wipes unapproved work without confirmation.

**Sam.** Every learner fraction announced as a slash string; the composer double-ringed for its nested controls; the gate's explanation hidden on phones; the dashboard's row labels disappeared under 720px.

**Jordan.** Studio opens on four variants, one blocked and one drafting, before the first draft; `gap` and `warning` are visually identical amber pills.

**9pm tired teacher.** The gate covered the section it asked her to have read; two `Interim:` paragraphs explained why two of three modes were disabled.

## Questions to Consider

1. Is the approve gate a panel over the document, or the last section of it?
2. Is attestation #1 real work, or theatre that should be deleted?
3. Which release is the dashboard drawing — today's single learner, or the class target?
