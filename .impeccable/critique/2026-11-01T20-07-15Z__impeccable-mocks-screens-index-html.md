---
target: redesign sketches
total_score: 27
max_score: 40
na_heuristics:
p0_count: 1
p1_count: 2
target_identity: "file:/mnt/f32b06de-7703-4583-ba3f-b589b79c0001/home/abdullah/personal/edu-canvas/.claude/worktrees/impeccable-init/.impeccable/mocks/screens/index.html"
target_fingerprint: "sha256:bba844b71c0f32b3bd3664e3cb61e108b03e658d1409011679724e82e296749b"
target_path: /mnt/f32b06de-7703-4583-ba3f-b589b79c0001/home/abdullah/personal/edu-canvas/.claude/worktrees/impeccable-init/.impeccable/mocks/screens/index.html
timestamp: 2026-11-01T20-07-15Z
slug: impeccable-mocks-screens-index-html
---

# Critique run 2: Edu-Canvas redesign sketches

Score 27/40 (Acceptable), up from 26. Method: dual-agent.

| # | Heuristic | Score | Key issue |
| --- | --- | --- | --- |
| 1 | Visibility of status | 3 | Unclear whether "Create lesson" regenerates when drafts already exist |
| 2 | Match real world | 3 | "variant", "grounding" and "v1/v2" are system words |
| 3 | User control | 3 | No way to un-approve a variant |
| 4 | Consistency | 2 | Variants named by activity, but every learner gets the matching board; mixed breadcrumb separators; two ghost-button sizes |
| 5 | Error prevention | 3 | Grades 3, 5 and 6 offered though only Grade 4 is supported |
| 6 | Recognition | 3 | Publish gives no preview of what each variant is |
| 7 | Flexibility | 1 | One dropdown per learner; no bulk assign or shortcuts |
| 8 | Minimalism | 3 | Lessons repeats "Needs you" items in "All lessons" |
| 9 | Error recovery | 4 | Every error states what happened, what's safe, and one action |
| 10 | Help | 2 | Nothing explains what a variant is |

## Priority issues

- **[P0] Variant meaning vs the student surface.** A–D are shown as four activities, but every student gets the matching board (PRODUCT.md: the only catalogs are matching-v1 and fractions-v2). Fix: say per variant what the student gets, or offer only variants that can run; add "Preview as student". Commands: clarify, shape.
- **[P1] Publish doesn't scale to a class of 25.** Add assign-to-all, multi-select learners, and counts per variant. Commands: shape, harden.
- **[P1] Approve is below the fold at 1280×800.** One-line heading, sticky approve bar. Command: layout.
- **[P2] Studio does two jobs; regenerating is ambiguous.** Collapse the composer once drafts exist; name the action "Draft again". Command: distill.
- **[P2] Phones.** Publish "Copy link" buttons clip; Review tabs hide the status of C and D. Command: adapt.

## Detector

- 0 findings with the project exceptions applied.
- Rendered pages: italic-serif-display on the Landing headline (partial: one word in the binding tagline); nested-cards on Review's edited section (real by measurement, meant as a change highlight).
- The nested-card and icon-tile findings from run 1 are resolved.

## Personas

- **Alex:** no bulk assign; all three checks on every approval, even with no warning.
- **Sam:** a selected-but-unpaired tile uses `aria-pressed`; forming a pair isn't announced; grade chips should be a radio group; the disabled Approve button isn't focusable.
- **Jordan:** "grounding" and "v1/v2" are never explained.
- **9 pm teacher:** Approve and Publish need a scroll; the idle-timeout banner is too loud.
