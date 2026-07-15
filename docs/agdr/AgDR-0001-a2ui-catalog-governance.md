# AgDR-0001 — Adopt real A2UI v0.9.1 with a custom Edu-Canvas catalog

> In the context of rendering AI-generated lessons to students safely, facing the risk of generated HTML/JS execution and an unbounded UI surface, I decided to adopt the real A2UI v0.9.1 protocol with a fixed, versioned, allowlisted Edu-Canvas catalog (SSE ↓ / HTTPS ↑), to achieve teacher-trustworthy generative UI, accepting the cost of catalog governance and an early (0.9.x) protocol dependency.

## Context
Edu-Canvas generates lesson UI from GPT-5.6 output. Letting the model emit arbitrary HTML/CSS/JS is an unacceptable safety + correctness surface (XSS, unpredictable grading affordances, inaccessible output). The PRD grill settled this (Q80–86): use the **real** A2UI protocol — not a relabeled custom payload — with a custom catalog scoped to matching activities. A2UI is at v0.9.1 (pre-1.0); adoption carries protocol-maturity risk.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| **A. Real A2UI v0.9.1 + custom allowlisted catalog** | Server compiles a validated draft into versioned messages from a fixed component/action set; renderer rejects unknowns; no generated code executes; strong "generative UI" judging story | Depends on a pre-1.0 protocol; catalog-governance overhead; must build the compiler |
| B. Custom "A2UI-like" JSON payload | Full control; no external protocol dep | Anti-pattern flagged in the strategy ("calling a custom payload A2UI without the real protocol"); loses interop + real catalog concepts; judges may see through it |
| C. Model emits sandboxed HTML (iframe/CSP) | Fast to demo | HTML execution surface; harder to make WCAG 2.2 AA + RTL; grading affordances unbounded; rejected by Q78/79 |

## Decision
**Option A.** The model emits a *lesson draft* (normalized domain model — Q25/Q87); the **server validates + compiles** it into A2UI v0.9.1 messages from a fixed Edu-Canvas catalog.
- **Transport:** SSE server→client streaming; HTTPS client→server actions (Q82).
- **Catalog:** versioned + immutable; breaking changes ship under a new catalog ID; client advertises supported versions (Q85).
- **Allowlisted actions only:** `selectSource`, `selectTarget`, `clearSelection`, `requestHint`, `submitAttempt`, `undoInk`, `clearInk`, `saveProgress` (Q84).
- **Client data boundary:** public IDs/labels/layout/selections/hints/feedback/progress/ink. **Answer key, mastery, permissions stay server-side** (Q86).
- The canonical lesson model stays **separate** from its A2UI projection (Q25) — A2UI is a render format, not the source of truth.

## Consequences
- + A generative-UI story that is safe, reviewable, and judge-legible.
- + The catalog is a **trust boundary** (feeds the threat model + the "unknown component rejected" submission test).
- − Must own an A2UI compiler + catalog versioning from day one.
- − v0.9.1 may change before 1.0 → **pin the version** and isolate the integration behind an interface so a catalog/transport swap stays localized (also enables the configurable-provider goal, Q72).

## Artifacts
PRD grill log Q25, Q78–86, Q87 · `docs/security/threat-model.md` (A2UI trust boundary) · `docs/walking-skeleton.md` AC #3
