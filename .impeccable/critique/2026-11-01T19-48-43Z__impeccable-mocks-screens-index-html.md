---
target: redesign sketches
total_score: 26
max_score: 40
na_heuristics:
p0_count: 1
p1_count: 2
target_identity: "file:/mnt/f32b06de-7703-4583-ba3f-b589b79c0001/home/abdullah/personal/edu-canvas/.claude/worktrees/impeccable-init/.impeccable/mocks/screens/index.html"
target_fingerprint: "sha256:0d03d43e3e083e4774e8092da975a83298ce559fd6eb8535efc9f3f31fd6286a"
target_path: /mnt/f32b06de-7703-4583-ba3f-b589b79c0001/home/abdullah/personal/edu-canvas/.claude/worktrees/impeccable-init/.impeccable/mocks/screens/index.html
timestamp: 2026-11-01T19-48-43Z
slug: impeccable-mocks-screens-index-html
---

# Critique: Edu-Canvas redesign sketches

Score 26/40 (Acceptable). Method: dual-agent.

| # | Heuristic | Score | Key issue |
| --- | --- | --- | --- |
| 1 | Visibility of status | 3 | Review never shows which of A–D are approved; tab dots are color only |
| 2 | Match real world | 3 | "variant", "grounding" and "4.NF.A.1" go unexplained |
| 3 | User control | 3 | No way to discard an edit in Review; no unpair on the student board |
| 4 | Consistency | 2 | Primary buttons split clay/black; variant model contradicts itself |
| 5 | Error prevention | 3 | Publish is one click with no summary of what gets frozen |
| 6 | Recognition | 3 | Approval checks sit in two separate cards |
| 7 | Flexibility | 1 | No bulk approve, no shortcuts, no duplicate lesson, one learner only |
| 8 | Minimalism | 3 | Studio hero heading takes about 250px of a working screen |
| 9 | Error recovery | 3 | Disabled Approve gives no reason |
| 10 | Help | 2 | Only "Why was this blocked?"; nothing says why there are four variants |

## Priority issues

- **[P0] Variant model contradicts itself.** Landing says "approve the one"; Publish ships A, B and D as "version 2" while labelling them v2/v1/v1; the learner link carries one variant. Fix: decide one-variant vs set and state what gets frozen. Commands: clarify, shape.
- **[P1] Paired tiles on the student board turn green before grading; no unpair.** Commands: harden, colorize.
- **[P1] Approval on Review is scattered:** two checks in separate cards, unexplained disabled button, no progress on tabs. Commands: clarify, layout.
- **[P2] Lessons dashboard is the rejected SaaS template** (stat cards, filters, table). Command: distill.
- **[P2] Phones lose the nav; primary buttons use two colors.** Commands: adapt, polish.

## Detector

- 0 findings with the project exceptions applied.
- Rendered-page scans: nested-cards (Studio matched-standard block, Landing mini tiles: real); icon-tile-stack ×6 (empty and error states screen: real); italic-serif-display (Studio and Landing headings: partial, one word only); nested-cards on Review's edited section (likely false).

## Personas

- **Alex:** approves four variants one at a time.
- **Sam:** tabs with no tab panels; color-only dots; paired tile `aria-pressed` contradicts its label.
- **Jordan:** never told why there are four variants.
- **9 pm teacher on a laptop:** variants sit below the fold.

## Questions

- Why generate four variants if one learner gets one?
- Should review happen in place on the Studio board?
- Should the student see the missed pair drawn on bars instead of a bare score?
