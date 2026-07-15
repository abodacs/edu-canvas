# AgDR-0002 — Server-authoritative, deterministic grading with answer-key isolation

> In the context of scoring student matching attempts fairly and safely, facing the risk of a client-tampered score or an answer-key leak to the runtime, I decided that grading is computed solely on the server from a private answer key using a fixed partial-credit formula, that clients only emit selection events, and that client-submitted scores are ignored, to achieve trustworthy, explainable, safe scoring of children's work, accepting the cost of server compute on every submission and strict key isolation.

## Context
Grading children's work must be correct, explainable, and tamper-proof. If the client can influence its own score, or if the answer key reaches the runtime, the product's core trust promise fails. PRD Q38/39 lock this: answer key is server-only; score computed backend-only; the client sends events, never a trusted score field. Partial credit (Q118): `correct / (required + incorrect) × 100`; exact all-and-only for `isCorrect`.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| **A. Server-authoritative grading; client emits events only; key never leaves server** | Tamper-proof; explainable; key isolation enforceable; honours "no AI grading from a screenshot" (Q16/55); deterministic → testable | Server compute per submission; key isolation must be designed carefully; client must be dumb |
| B. Client computes, server re-checks | Lower perceived latency | Two sources of truth; invites client-trust bugs; key must reach the client to grade → leaks |
| C. AI grades the attempt (Vision on the student board) | Less bespoke logic | Explicitly rejected (Q55/56): no student images to AI; non-deterministic; unsafe for children's data |

## Decision
**Option A.**
- **Answer key is server-only**, stored separately from visual components (Q38). It is absent from any A2UI message and any client bundle.
- The client emits only **selection events** (`selectSource/Target`, `clearSelection`, `submitAttempt`); a client-submitted `score` field is **ignored** (Q39).
- **Score** = `correct matches / (required matches + incorrect matches) × 100` (Q118); `isCorrect` requires exact all-and-only matching.
- Attempts are **immutable** and pin the graph / catalog / model versions used (Q29/144).
- Hint use does not reduce raw score, but assisted attempts do not count toward the two mastery proofs (Q46/119).

## Consequences
- + The two highest-value submission tests fall out directly: "client score ignored" + "invalid answer key never reaches the runtime."
- + Deterministic grading → deterministic adaptation (next activity is reproducible) → explainable to teachers (Q70).
- − Every submission is a server round-trip; design for the p95 SLO (Q28).
- − Key isolation must be enforced in code review + tests — this is the **single highest-impact defect surface** (see the threat model).
- **Hard rule for the build:** even under deadline pressure, do **not** ship a client-computed score or leak the key to make a feature easier. These are submission evidence, not polish.

## Artifacts
PRD grill log Q9–10, Q16, Q38–39, Q46, Q55–56, Q118–119, Q144 · `docs/security/threat-model.md` (spoofing/tampering on the grading path) · `docs/walking-skeleton.md` AC #2 + submission tests
