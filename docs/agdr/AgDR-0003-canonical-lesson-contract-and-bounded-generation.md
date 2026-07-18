# AgDR-0003 — Keep lesson generation canonical and bounded at the server seam

> In the context of generating four lesson variants from a teacher request, facing the risk of model-shaped UI, leaked answer relationships, and unbounded correction loops, I decided to make the server-owned canonical lesson contract the provider boundary, validate it before projection, and allow one automatic correction followed by an explicit teacher retry, to achieve safe and auditable draft generation, accepting the cost of a separate projection and persisted attempt history.

## Context

Issue #3 needs a useful teacher authoring path without letting model output become executable UI or a browser-trusted answer key. The provider must support a deterministic fixture for the seeded demo and a server-only GPT-5.6 adapter. Invalid content needs actionable diagnostics, while transient failures need recovery without silently retrying forever.

## Options considered

| Option                                                                | Pros                                                                                                                             | Cons                                                                                                                |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **A. Canonical server contract + strict validation + one correction** | Keeps domain truth separate from A2UI, makes safety and tests explicit, gives teachers actionable failures, bounds provider cost | Requires schemas, a private/public projection, and attempt persistence                                              |
| B. Let the provider return UI/A2UI messages directly                  | Faster initial integration                                                                                                       | Expands the model trust boundary, risks executable content and answer-key leakage, couples generation to a renderer |
| C. Retry until a valid draft is produced                              | May hide occasional model errors                                                                                                 | Unbounded cost/latency, poor auditability, and can turn a bad request into a server-side loop                       |

## Decision

**Option A.** The provider returns only the server-owned lesson-draft domain shape. The validator rejects malformed relationships, unknown fields, unsafe content, invalid variant composition, missing metadata, and bounded-content violations. Warnings remain visible and persisted; errors prevent `ready-for-review`.

- The public projection contains labels and teacher-review metadata but omits private relationships and answer references.
- The service performs exactly one correction attempt after a validation error. A second validation failure remains `blocked-by-validation` and requires an explicit teacher retry.
- Timeout, rate-limit, and transient provider failures retain safe diagnostics in retryable states. Moderation blocks retain request metadata but never return unsafe content.
- Every attempt records provider/model/prompt-template/validator provenance and the idempotency key.

## Consequences

- - The provider can change without changing the browser contract or future A2UI compiler.
- - Deterministic fixtures cover valid, malformed, corrected, blocked, moderated, and retryable paths without network calls.
- - The client receives only a zod-validated public result, while server persistence retains the private relationship graph.
- − Generation has more explicit state and persistence code than a direct model-to-UI path.
- − A teacher must retry a draft after the bounded correction fails; this is intentional and visible rather than hidden provider work.

## Handoff

Issue #18 consumes the normalized draft and adds bounded curriculum and
learning-quality validation. Issue #28 places the cross-cutting hard safety
gate before preview and Share. Issue #4 consumes only accepted public content
for allowlisted A2UI preview; this decision does not authorize rendering,
approval, publication, grading, or adaptation.

## Artifacts

Issue #3 · `src/shared/generation-contract.ts` · `src/server/generation/validation.ts` · `src/server/generation/service.ts` · `src/server/generation/projection.ts` · `migrations/0002_lesson_generation.sql`
