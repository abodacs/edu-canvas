# Walking Skeleton — Equivalent-Fractions Demo Loop

> The thinnest end-to-end slice through **every architectural layer**. **Kept** — full SDLC, the product grows on top of it. Not a spike, not throwaway. This is the 48-hour Devpost competition cut; the full production PRD is explicitly out of scope here.

## The one loop

```
teacher prompt → GPT-5.6 draft → server validation → A2UI render →
teacher approval → student matching → server score → connection reveal → next activity
```

**Concept: equivalent fractions.** Source `1/2` → targets `2/4`, `3/6`, `4/8`; `2/3` is a distractor. The reveal shows the different names cover the same portion of a whole, then routes a struggling student to the "equal parts" prerequisite.

## Every layer must be real (no stub across a boundary)

| Layer | What must exist | Stub OK? |
|---|---|---|
| HTTP / server boundary | TanStack Start server function: receives teacher prompt, returns A2UI | No |
| GPT-5.6 call | Real server-side OpenAI call producing a structured lesson draft | No |
| Validation | Server validates draft → IDs, source/target, distractors, 4 variants, a11y metadata; rejects invalid | No |
| A2UI compilation | Server compiles validated draft → A2UI v0.9.1 messages from the allowlisted semantic catalog | No |
| Persistence | PostgreSQL (or production-shaped seeded repo): tenant, teacher, student, standards, graph, activity versions, attempts | Seeded OK; schema real |
| Auth | Seeded judge demo account; real auth deferred | Seeded OK |
| Teacher UI | Composer + bulk-approval screen (4 variants, one edit, one validator warning) | No |
| Student UI | Responsive semantic-DOM matching screen, multi-select, EN/AR toggle, RTL, keyboard path, reduced motion; no experimental canvas dependency | No |
| Grading | Server computes score from the private answer key; **client score ignored** | No |
| Reveal + adapt | Connection reveal + one deterministic next-activity decision from a small prerequisite graph | No |

## Acceptance criteria
1. A judge can `git clone` → install → run → log in as the seeded teacher → prompt *"equivalent fractions for grade 4"* → see 4 variants → approve → switch to student → match → submit → see score + reveal + next activity, in **English and Arabic (RTL)**, end-to-end under ~3 minutes.
2. **Server-authoritative:** no client path can produce or submit a score; the answer key is absent from every client bundle and A2UI message.
3. **A2UI trust:** the renderer rejects an unknown component/action (proven by a test that feeds one).
4. **Deterministic adaptation:** given a fixed attempt result, the next activity + its reason are reproducible.
5. **WCAG 2.2 AA:** keyboard-complete semantic-DOM path; no canvas/ink-only interaction; reduced-motion respected. The demo remains usable when HTML-in-Canvas is unavailable.

## Submission-critical tests (Devpost evidence — these ship with the demo)
- Invalid model output is rejected — no invalid answer key reaches the runtime.
- Client-submitted scores are ignored.
- A2UI catalog rejects unknown components/actions.
- Core lesson rendering works without HTML-in-Canvas or browser flags.
- Deterministic adaptation trace: result → reason → next approved activity.

## Explicitly out of scope (production PRD — NOT this slice)
Full Grades 3–6 graph · multiple subjects · syllabus uploads · Vision grading · real student data + consent · SSO · parent accounts · multi-school · offline multi-device sync · broad freehand ink · large activity browsing. See `DEVPOST_WINNING_STRATEGY.md` § "Explicitly cut from the competition demo".

## Build harness
Implementation in **Codex + GPT-5.6** (Devpost requirement). Treat `docs/agdr/` + this file as the build contract. ApexYard governance (Claude Code) owns the design layer; Codex owns the code.
