# Walking Skeleton — Equivalent-Fractions Loop

> The thinnest end-to-end slice through **every architectural layer**. **Kept** — full SDLC, the production product grows on top of it. Not a spike, not throwaway. Written in July 2026 and updated 2026-10-25 for the production direction ([#89](https://github.com/abodacs/edu-canvas/issues/89)); the production deployment path and gates live in [ROADMAP.md](../ROADMAP.md) and the [release runbook](release-fly-supabase.md).

> **Status note:** this is a target contract, not a claim that every step is shipped. The foundation in [issue #2](https://github.com/abodacs/edu-canvas/issues/2), the canonical structural generation slice in [issue #3](https://github.com/abodacs/edu-canvas/issues/3), bounded curriculum/learning-quality validation in [issue #18](https://github.com/abodacs/edu-canvas/issues/18), the allowlisted teacher A2UI preview in [issue #4](https://github.com/abodacs/edu-canvas/issues/4), and the validated prerequisite path in [issue #17](https://github.com/abodacs/edu-canvas/issues/17) are shipped; the hard safety gate and downstream loop remain in the [open issue graph](https://github.com/abodacs/edu-canvas/issues). Issue #27 is closed (2026-10-21); re-verify the reported false-success behavior against the release candidate before calling the preview learner-safe. See [`docs/product-strategy.md`](product-strategy.md) for the issue-driven order and seven-layer audit.

## The one loop

```
teacher prompt → model draft → validation gate → reverse prerequisite path →
next-step text → A2UI preview → teacher approval → student matching → server score →
connection reveal → next activity → teacher reason
```

**Concept: equivalent fractions.** Source `1/2` → targets `2/4`, `3/6`, `4/8`; `2/3` is a distractor. The reverse path makes the prerequisite explicit (`equal parts` → `equivalent fractions`); the forward story is brief next-step text in the teacher view, not a separate presentation artifact ([#19](https://github.com/abodacs/edu-canvas/issues/19)). The reveal shows that the different names cover the same portion of a whole, then routes a struggling student to the prerequisite.

## Every layer must be real (no stub across a boundary)

| Layer | What must exist | Stub OK? |
| --- | --- | --- |
| HTTP / server boundary | TanStack Start server function: receives teacher prompt, returns A2UI | No |
| Model call | Real server-side provider call producing a structured lesson draft | No |
| Validation | Server validates structure and bounded curriculum/learning quality → IDs, source/target, distractors, 4 variants, a11y metadata; returns `pass`, `warning`, or `hard_block`, with hard blocks stopping preview/Share | No |
| A2UI compilation | Server compiles validated draft → A2UI v0.9.1 messages from the allowlisted semantic catalog | No |
| Persistence | PostgreSQL (or production-shaped seeded repo): tenant, teacher, student, standards, graph, activity versions, attempts | Seeded OK; schema real |
| Auth | Seeded validation account; protected sessions before any public or real-user access (see [design Q16](design/design-doc-questions.md)) | Seeded OK for validation |
| Teacher UI | Composer + bulk-approval screen (4 variants, one edit, visible validator warning, reverse prerequisite path, and forward story) | No |
| Student UI | Responsive semantic-DOM matching screen, multi-select, English UI (Arabic deferred), keyboard path, reduced motion; no experimental canvas dependency | No |
| Grading | Server computes score from the private answer key; **client score ignored** | No |
| Reveal + adapt | Connection reveal + one deterministic next-activity decision from a small prerequisite graph | No |

## Acceptance criteria

1. A new user can `git clone` → install → run → log in as the seeded teacher → prompt _"equivalent fractions for grade 4"_ → see 4 variants → approve → switch to student → match → submit → see score + reveal + next activity, **in English**, end-to-end under ~3 minutes.
2. **Server-authoritative:** no client path can produce or submit a score; the answer key is absent from every client bundle and A2UI message.
3. **A2UI trust:** the renderer rejects an unknown component/action (proven by a test that feeds one).
4. **Deterministic adaptation:** given a fixed attempt result, the next activity + its reason are reproducible.
5. **WCAG 2.2 AA:** keyboard-complete semantic-DOM path; no canvas/ink-only interaction; reduced-motion respected. The product remains usable when HTML-in-Canvas is unavailable.

## Boundary tests (release evidence — these ship with every release)

- Invalid model output is rejected — no invalid answer key reaches the runtime.
- Client-submitted scores are ignored.
- A2UI catalog rejects unknown components/actions.
- Core lesson rendering works without HTML-in-Canvas or browser flags.
- Deterministic adaptation trace: result → reason → next approved activity.

## Current issue-driven gaps

- [Issue #3](https://github.com/abodacs/edu-canvas/issues/3) ships the canonical structural generation and recovery seam; [issue #18](https://github.com/abodacs/edu-canvas/issues/18) ships bounded curriculum and learning-quality validation.
- [Issue #28](https://github.com/abodacs/edu-canvas/issues/28) adds the hard safety gates required for a production preview and Share. Issue #27 is closed (2026-10-21); its reported failure — a distractor-only selection producing a success reveal — must be re-verified against the release candidate (AC12 in the [implementation contracts](design/design-doc-implementation.md)) before the preview is called learner-safe.
- The validated reverse prerequisite path is shipped in [issue #17](https://github.com/abodacs/edu-canvas/issues/17); the forward story is brief next-step text in the teacher view ([#19](https://github.com/abodacs/edu-canvas/issues/19)), not a standalone artifact. The teacher/student loop then proceeds through [#4–#11](https://github.com/abodacs/edu-canvas/issues/4).
- Generalizing the catalog, standards packs, and bounded multi-page flows is later work in [issues #29–#31](https://github.com/abodacs/edu-canvas/issues/29); do not widen the surface before the core loop is trustworthy.

## Explicitly out of scope (production PRD — NOT this slice)

Full Grades 3–6 graph · multiple subjects · syllabus uploads · Vision grading · real student data + consent · SSO · parent accounts · multi-school · offline multi-device sync · broad freehand ink · large activity browsing. Production scope for these lives in [ROADMAP.md](../ROADMAP.md) ("Defer until the evidence justifies expansion") and the [delivery priorities](product/delivery-priorities.md).

## Build harness

The July 2026 cut was implemented with **Codex + GPT-5.6** under the then-current Devpost requirement; that build-harness rule is historical. Treat `docs/agdr/` + this file as the build contract. ApexYard governance (Claude Code) owns the design layer.
