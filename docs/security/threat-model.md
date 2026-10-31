# Threat Model — Edu-Canvas (STRIDE)

> Refreshed 2026-10-27 against the implemented generation, A2UI/SSE preview, persistence, and synthetic-data paths ([#73](https://github.com/abodacs/edu-canvas/issues/73)). Replaces the pre-build pass of 2026-10-25. Each control names the code or migration that implements it. Each residual is marked **accepted**, **partial**, or **open**, and links to its owner where a follow-up exists. This is a milestone model: synthetic data only, with client-chosen demo roles and no production authentication. [AgDR-0007](../agdr/AgDR-0007-demo-access-and-deployment.md) and the [release runbook](../release-fly-supabase.md) record the target access and limit model; the code does not implement it yet, and [#74](https://github.com/abodacs/edu-canvas/issues/74) reconciles the deployment configuration. **Children's data and server-authoritative grading make the production surface higher than usual; these controls are not deferable.**

## Evidence boundary

Implemented and covered here:

- Server-side generation, structural validation, semantic validation, bounded deadlines, idempotency, and request ownership (`src/server/generation/`).
- A2UI catalog compilation and the server-sent-events preview (`src/server/a2ui/`, `src/components/a2ui/`).
- Tenant-scoped persistence with forced row-level security (`src/server/persistence/`, `drizzle/`).
- Synthetic-only configuration gate (`src/server/config.ts`).
- Scrubbed structured errors and Sentry delivery (`src/server/observability.server.ts`).

Not implemented. Do not claim these as controls:

- Production authentication, sessions, and CSRF protection ([#74](https://github.com/abodacs/edu-canvas/issues/74), [#98](https://github.com/abodacs/edu-canvas/issues/98)).
- Generation quotas and rate limits ([#74](https://github.com/abodacs/edu-canvas/issues/74), [#104](https://github.com/abodacs/edu-canvas/issues/104)).
- Approval, publication, and grading beyond the preview boundary ([#5](https://github.com/abodacs/edu-canvas/issues/5), [#6](https://github.com/abodacs/edu-canvas/issues/6), [#28](https://github.com/abodacs/edu-canvas/issues/28)).
- Provider-side moderation or personal-data detection ([#132](https://github.com/abodacs/edu-canvas/issues/132)).
- Cross-teacher authorization inside one tenant ([#131](https://github.com/abodacs/edu-canvas/issues/131)).

## Trust boundaries

| # | Boundary | Enforcement point | Evidence |
| --- | --- | --- | --- |
| 1 | Student/teacher browser ⟷ server | TanStack Start server functions and `GET /api/a2ui/preview`; HTTPS terminates at the platform | `src/server/demo/server-function.ts`, `src/server/a2ui/preview.server.ts` |
| 2 | Server ⟷ generation provider | HTTPS; server-only API key; strict JSON schema; abort budgets | `src/server/generation/provider.ts`, `src/server/generation/factory.ts` |
| 3 | Server ⟷ PostgreSQL | Per-transaction `app.tenant_id`; forced row-level security; tenant-qualified queries | `drizzle/0000_baseline.sql`, `drizzle/0001_foundation_behaviors.sql`, `src/server/persistence/postgres.ts` |
| 4 | Model output ⟷ executable UI | Fixed `matching-v1` A2UI catalog; server compiles and validates; browser re-validates | `src/shared/a2ui-contract.ts`, `src/server/a2ui/compiler.ts`, `src/server/a2ui/stream.ts`, `src/components/a2ui/renderer.ts` |
| 5 | Teacher ⟷ student capability | Server-resolved capability list derived from the selected demo role | `src/server/demo/policy.ts` |
| 6 | Server ⟷ logs and Sentry | Field allowlist and pattern scrubbing; `sendDefaultPii: false` | `src/server/observability.server.ts` |

## Assets

- The private answer key: `activity_versions.answer_key` and the generated `relationships` inside `lesson_draft_requests.draft`.
- Teacher prompts and generated drafts before publication.
- Synthetic identities, the tenant identifier, and seeded counts.
- Provider API key, database URL, and Sentry DSN.
- The provider call budget and the preview surface's catalog integrity.

## STRIDE

Threat IDs are local to this document. They are unrelated to the design documents' E1–E8 evidence tasks.

### Spoofing

**S1 — A caller chooses the demo role.** _Control:_ `getDemoSession(role)` maps only `teacher` or `student` to a seeded identity (`src/server/demo/policy.ts`). `assertTeacherCanGenerate` requires the teacher role, the seeded teacher identity, and the `generate_lesson_draft` capability (`src/server/generation/service.ts`). The preview route returns 403 for a non-teacher role (`src/server/a2ui/preview.server.ts`). _Residual:_ the role is client-supplied, so any caller can act as the seeded teacher. **Accepted** only for the synthetic milestone; [#74](https://github.com/abodacs/edu-canvas/issues/74) adds a signed demo session and [#98](https://github.com/abodacs/edu-canvas/issues/98) adds production authentication.

**S2 — Model output presented as a valid lesson.** _Control:_ the provider response must pass `validateProviderDraft` (`src/server/generation/validation.ts`). That check rejects unknown fields, executable markup, duplicate identifiers, broken relationships, and language or direction mismatches. Semantic validation then runs the curriculum and learning-quality reviewers; a `block` verdict or a `retryable` status stops acceptance (`src/server/generation/semantic-validation.ts`, `src/server/generation/draft-acceptance.ts`, `src/server/generation/curriculum-validator.ts`, `src/server/generation/learning-quality-validator.ts`). Only a record in `ready-for-review` compiles. `compileLessonPreview` validates every message before streaming (`src/server/a2ui/compiler.ts`). Property tests in `src/server/generation/lesson-gate-properties.test.ts` re-check every accepted draft against the gate rules. _Residual:_ **Accepted**. Deterministic validators block structural, curriculum, and learning-quality failures; teacher review remains the final gate for advisory recommendations and classroom fit.

**S3 — A stolen invitation or session credential opens a teacher session.** _Control:_ this build has no invitation, cookie, or bearer session to steal. _Residual:_ **Accepted** temporarily. [#74](https://github.com/abodacs/edu-canvas/issues/74) introduces signed HttpOnly demo sessions; [#98](https://github.com/abodacs/edu-canvas/issues/98) replaces them with a reviewed identity model.

**S4 — The server talks to an impersonated provider.** _Control:_ `OPENAI_BASE_URL` must use HTTPS, or HTTP on a loopback host (`src/server/config.ts`). The provider key is held by the server and is never sent to the browser. Provenance records provider, model, prompt-template version, and validator version (`src/server/generation/provider.ts`, `src/server/generation/types.ts`). _Residual:_ **Accepted**. Transport identity depends on the platform certificate trust; there is no provider attestation.

### Tampering

**T1 — A client tampers with a score or the answer key.** _Control:_ the preview has no scoring or submission path. The public projection omits `relationships` (`src/server/generation/projection.ts`), and the compiler test asserts that relationship data stays out of the serialized preview (`src/server/a2ui/compiler.test.ts`). _Residual:_ **Open** under the grading work in [#6](https://github.com/abodacs/edu-canvas/issues/6); [AgDR-0002](../agdr/AgDR-0002-server-authoritative-grading.md) remains the contract.

**T2 — Curated content or an answer key is changed after publication.** _Control:_ `activity_versions.answer_key` is a separate column from `public_content`; update and delete triggers reject changes to `activity_versions` and `attempts` (`drizzle/0001_foundation_behaviors.sql`). `lesson_draft_requests.draft` is mutable by design, but it is server-owned and reachable only through tenant-qualified persistence. _Residual:_ **Open** under the least-privilege work in [#100](https://github.com/abodacs/edu-canvas/issues/100); a database superuser can bypass triggers.

**T3 — Prompt injection or executable content reaches the model or the UI.** _Control:_ the moderation seam blocks markup, instruction overrides, reviewed harm phrases, and personal data before the provider call and before persistence (`src/server/moderation/content-safety.ts`). Every block reports one stable code and a teacher-safe category. The provider response is constrained by a strict JSON schema (`lessonDraftJsonSchema` in `src/server/generation/provider.ts`) and re-validated on receipt. The A2UI contract rejects unsupported markup during schema parsing, and it rejects private field names and styling keys before parsing (`src/shared/a2ui-contract.ts`). The renderer emits React text nodes; no code uses `dangerouslySetInnerHTML` or `eval` outside the A2UI denylist. SSE frames JSON-encode their data, so content containing a newline cannot forge an event (`src/server/a2ui/stream.ts`). _Residual:_ **Partial**. The rule set scores 1.00 precision and 0.63 recall on the held-out corpus; 6 of 16 obfuscated attacks survive (`docs/hackathon/meta-global-2026/evidence/moderation-2026-10-31`). An enforced CSP with a per-request nonce, `nosniff`, `referrer-policy: no-referrer`, and `frame-ancestors 'none'` now applies at the HTTP edge ([#130](https://github.com/abodacs/edu-canvas/issues/130); `src/server/security-headers.ts`, `src/start.ts`). Teacher review remains the gate.

**T4 — Concurrent or replayed requests corrupt request ownership.** _Control:_ the service combines an idempotency key with a canonical request hash (`createGenerationRequestHash`). `claimGeneration` relies on unique constraints and a savepoint (`src/server/persistence/generation-persistence.ts`). Every write must match the attempt, the previous `updatedAt`, and an active lease (`updateRequestWithExpectation` in `src/server/persistence/postgres.ts`). The lease is 220 seconds, longer than the 200-second total budget (`src/server/generation/types.ts`). Conformance tests cover replay, stale owners, and deadline aborts (`src/server/generation/service-conformance.test.ts`). _Residual:_ **Open** as [#131](https://github.com/abodacs/edu-canvas/issues/131); the lookup is not teacher-bound. See I4.

### Repudiation

**R1 — "I did not request, retry, or cancel that."** _Control:_ `lesson_draft_requests` stores the request identifier, tenant, teacher, normalized input, state, diagnostics, provenance, and timestamps. `lesson_generation_attempts` stores the attempt number, idempotency key, request hash, state, diagnostics, provenance, and creation time (`drizzle/0000_baseline.sql`). Cancellation appends a `GENERATION_CANCELLED` diagnostic (`src/server/generation/service.ts`). Structured error events use one schema and a scrubbed context (`src/server/observability.server.ts`). _Residual:_ **Accepted** for the milestone; there is no immutable audit log, and preview reads and demo role selection are not recorded. Approval and publication audit belongs to [#5](https://github.com/abodacs/edu-canvas/issues/5) and [#28](https://github.com/abodacs/edu-canvas/issues/28).

**R2 — Operational logs cannot support an investigation.** _Control:_ one event schema (`edu-canvas.server-error.v1`), an allowlist for context keys, and pattern removal for URLs, bearer tokens, email addresses, and identifier-like strings. Sentry runs with `sendDefaultPii: false` and strips user, request, extra, and breadcrumb data. _Residual:_ **Open** under the retention and alerting work in [#103](https://github.com/abodacs/edu-canvas/issues/103).

### Information disclosure

**I1 — The answer key reaches the client.** _Control:_ `toPublicGenerationResult` drops `relationships` and other internal fields (`src/server/generation/projection.ts`). The compiler emits catalog components and lesson copy only, never relationships. `validateA2UIMessage` rejects payload keys such as `answerKey`, `mastery`, `permissions`, and `secret` before schema parsing (`src/shared/a2ui-contract.ts`). The build scan rejects forbidden tokens in `.output/public` (`scripts/verify-client-boundary.ts`), and the architecture check rejects `answerKey` in the demo snapshot (`scripts/verify-architecture.ts`). _Residual:_ **Accepted** for the preview path; grading remains [#6](https://github.com/abodacs/edu-canvas/issues/6).

**I2 — Student data reaches the model.** _Control:_ the provider prompt contains the teacher request plus synthetic seed content only (`buildProviderContext` and `buildPrompt`). No student record is loaded on the generation path. The seeded student is synthetic demo data, not a real record, and the synthetic gate blocks real-data configuration (`src/server/config.ts`). Before the provider call, `checkPrompt` blocks email shapes, phone shapes, labelled identifiers, and reviewed first names (`src/server/moderation/content-safety.ts`). Generated content is screened for the structural shapes only, because word problems use first names legitimately. _Residual:_ **Partial**. Held-out measurement: 5 of 7 personal-data rows blocked, 0 false positives on 10 benign rows. An unlisted name still reaches the provider. A Presidio PII arm caught the two names the rules missed while missing the phone and identifier shapes, so the two arms are complementary, not substitutable. The teacher's own prompt is retained in their request row for the revise flow. Real data stays blocked until [#101](https://github.com/abodacs/edu-canvas/issues/101) and [#72](https://github.com/abodacs/edu-canvas/issues/72) close.

**I3 — A read crosses tenant boundaries.** _Control:_ every generation and preview persistence call receives `tenantId` from the session. Postgres sets `app.tenant_id` inside each transaction, and every application data table has forced row-level security (`drizzle/0000_baseline.sql`, `drizzle/0001_foundation_behaviors.sql`, `src/server/persistence/postgres.ts`, `src/server/persistence/generation-persistence.ts`). An unset setting compares against `NULL` and yields no rows, so the policy fails closed. The preview additionally compares `record.teacherId` with the session identity. The Drizzle adapter uses the same setting contract (`src/server/persistence/drizzle.ts`), and both adapters pass `src/server/persistence/persistence-contract.test.ts`. _Residual:_ **Open** under [#100](https://github.com/abodacs/edu-canvas/issues/100); the application database role must not be a superuser or hold `BYPASSRLS`.

**I4 — A teacher reads another teacher's draft inside one tenant.** _Control:_ preview, cancel, and retry compare the stored `teacherId` with the session identity. _Residual:_ **Open** as [#131](https://github.com/abodacs/edu-canvas/issues/131). The pre-generation idempotency lookup filters by tenant only (`findGenerationByIdempotencyKey` in `src/server/generation/service.ts` and `readGenerationByQuery` in `src/server/persistence/postgres.ts`). Implicit keys are derived from request metadata, so two teachers with the same input can collide. The current demo has one teacher per tenant.

**I5 — Secrets or private content appear in errors and logs.** _Control:_ user-facing errors carry stable codes and safe messages (`src/server/generation/generation-request-error.ts`, `LessonProviderError.safeMessage`). Readiness uses `safeConfigSummary` (`src/server/config.ts`). Observability scrubs URLs, bearer tokens, email addresses, and identifiers. The client-boundary scan blocks `OPENAI_API_KEY`, `DATABASE_URL`, `SENTRY_DSN`, and server-error markers from the browser bundle. _Residual:_ **Open** for retention under [#103](https://github.com/abodacs/edu-canvas/issues/103); server logs intentionally keep error stacks.

### Denial of service

**D1 — Unbounded provider cost.** _Control:_ the service enforces a 100-second per-call deadline, a 200-second total budget, and a 220-second claim lease. It allows one correction and therefore at most two provider calls per request. A duplicate request waits at most 5 seconds for the winner. Replay returns the stored result without a provider call. Input sizes are bounded: a 500-character prompt, four variants, and 400-character accepted text fields (`src/shared/generation-contract.ts`, `src/server/generation/validation.ts`). The provider schema bounds its arrays (`src/server/generation/provider.ts`), and the A2UI contract caps the emitted surface (`src/shared/a2ui-contract.ts`). Demo mode uses a deterministic provider and needs no key (`src/server/generation/factory.ts`). _Residual:_ **Open** under [#74](https://github.com/abodacs/edu-canvas/issues/74) and [#104](https://github.com/abodacs/edu-canvas/issues/104). No per-teacher or per-tenant quota exists, and `fly.toml` currently sets `DEMO_MODE = "false"` with two Machines.

**D2 — A flood of preview or SSE requests.** _Control:_ the preview reads one existing `ready-for-review` record, compiles at most four surfaces, then materializes and closes the stream. It rejects an unsupported catalog and an invalid request identifier before any persistence work. The browser abandons a stalled preview after 8 seconds (`src/components/a2ui/lesson-preview.tsx`). _Residual:_ **Open** under [#109](https://github.com/abodacs/edu-canvas/issues/109); no per-client connection or request limit exists.

**D3 — An oversized or hostile payload.** _Control:_ strict Zod schemas guard every boundary. The provider JSON schema bounds its arrays and most strings, and the Zod contract enforces the final text length and rejects unknown fields (`src/server/generation/validation.ts`). A2UI caps a surface at 500 components, 100 children, and 500-character text. The request identifier is a bounded pattern and the role is an enum. `jsonValue` rejects non-JSON and non-finite values before persistence (`src/server/persistence/postgres.ts`). _Residual:_ **Accepted**. The provider HTTP response body is not size-capped, and the server contacts only the configured provider endpoint (HTTPS, or loopback HTTP for local tests).

### Elevation of privilege

**E1 — A caller escalates to teacher capabilities by choosing a role.** _Control:_ the same checks as S1: server-resolved capabilities, the seeded identity requirement, and the preview's teacher-only gate. _Residual:_ **Accepted** for the synthetic milestone; [#74](https://github.com/abodacs/edu-canvas/issues/74) and [#98](https://github.com/abodacs/edu-canvas/issues/98) own the real boundary.

**E2 — An unknown A2UI component, action, or version grants new UI capability.** _Control:_ the catalog and protocol versions are pinned. `validateA2UIMessage` rejects unknown components, unknown actions, unsupported protocol versions, unsupported catalogs, duplicate component identifiers, private field names, and styling or HTML keys (`src/shared/a2ui-contract.ts`). The browser validates every message again before applying it (`src/components/a2ui/renderer.ts`), and the surface rejects a catalog change after creation. The catalog has no URL, image, or script component. Tests cover the rejection paths in `src/shared/a2ui-contract.test.ts`, `src/server/a2ui/compiler.test.ts`, and `src/components/a2ui/renderer.test.ts`. _Residual:_ **Partial**. The baseline CSP is enforced with a per-request nonce ([#130](https://github.com/abodacs/edu-canvas/issues/130)); catalog-version drift stays open as [#110](https://github.com/abodacs/edu-canvas/issues/110).

**E3 — A student session reaches teacher actions.** _Control:_ `assertTeacherCanGenerate` rejects a non-teacher session. The preview returns 403 for a student. Capabilities are resolved on the server from the role (`src/server/demo/policy.ts`). _Residual:_ **Accepted** with S1 and E1; because the role is client-supplied, a caller can ask for the teacher role. [#74](https://github.com/abodacs/edu-canvas/issues/74) and [#98](https://github.com/abodacs/edu-canvas/issues/98) close it.

**E4 — The database role bypasses tenant isolation.** _Control:_ forced row-level security, tenant-qualified statements, and a per-transaction tenant setting. _Residual:_ **Open** under [#100](https://github.com/abodacs/edu-canvas/issues/100); a superuser or a role with `BYPASSRLS` defeats the policies.

## Highest-priority controls for the milestone deployment

| Control | Status | Evidence | Owner |
| --- | --- | --- | --- |
| Answer-key isolation and no client-submitted score | Implemented for preview | `src/server/generation/projection.ts`, `src/server/a2ui/compiler.test.ts`, `scripts/verify-client-boundary.ts` | [#6](https://github.com/abodacs/edu-canvas/issues/6) for grading |
| A2UI catalog rejects unknown components and actions | Implemented | `src/shared/a2ui-contract.ts`, `src/components/a2ui/renderer.ts`, contract tests | [#110](https://github.com/abodacs/edu-canvas/issues/110) for catalog drift |
| Baseline security response headers | Implemented | `src/server/security-headers.ts`, `src/start.ts`, `scripts/smoke.ts` | [#130](https://github.com/abodacs/edu-canvas/issues/130) |
| Server-side structural and semantic validation | Implemented | `src/server/generation/validation.ts`, `src/server/generation/semantic-validation.ts`, `src/server/generation/lesson-gate-properties.test.ts` | [#28](https://github.com/abodacs/edu-canvas/issues/28) for the full gate |
| Synthetic-data-only and EU-residency gate | Synthetic gate implemented; EU residency open | `src/server/config.ts`, [README safety boundaries](../../README.md#safety-boundaries-non-negotiable-even-under-deadline-pressure) | [#72](https://github.com/abodacs/edu-canvas/issues/72), [#101](https://github.com/abodacs/edu-canvas/issues/101) |
| Deterministic adaptation trace | Implemented as version pins | `src/server/generation/learning-path.ts`, `src/components/a2ui/component-renderer.tsx` | [#5](https://github.com/abodacs/edu-canvas/issues/5) for publication |
| Protected access and bounded cost | Not implemented | `src/server/demo/policy.ts`, `fly.toml` | [#74](https://github.com/abodacs/edu-canvas/issues/74), [#104](https://github.com/abodacs/edu-canvas/issues/104), [#98](https://github.com/abodacs/edu-canvas/issues/98) |
| Input moderation and personal-data handling | Partial (measured: precision 1.00, recall 0.63 held out) | `createDefaultContentSafety` in `src/server/moderation/content-safety.ts` | [#132](https://github.com/abodacs/edu-canvas/issues/132) |

## Accepted risks and release triggers

- **Client-chosen demo role (S1, S3, E1, E3).** Accepted only while the deployment holds synthetic data and is not open to real users. Trigger: a public URL or a live provider key. `fly.toml` already sets `DEMO_MODE = "false"` and two Machines, so the deploy gate in [#74](https://github.com/abodacs/edu-canvas/issues/74) must land before hosting; [#98](https://github.com/abodacs/edu-canvas/issues/98) owns the production boundary.
- **No generation quota (D1).** Accepted only for a controlled synthetic deployment. Trigger: a public URL or a live provider key. Owner: [#74](https://github.com/abodacs/edu-canvas/issues/74), [#104](https://github.com/abodacs/edu-canvas/issues/104).
- **Deterministic moderation only (T3, I2).** Accepted only while every prompt and lesson is synthetic. The measured recall gap is a condition of this risk: unlisted names, novel harm phrasing, and obfuscated markup pass. Trigger: real teacher or student text. Owner: [#132](https://github.com/abodacs/edu-canvas/issues/132).
- **Tenant-scoped idempotency lookup (I4).** Accepted while a tenant has one teacher. Trigger: a second teacher in any tenant. Owner: [#131](https://github.com/abodacs/edu-canvas/issues/131).
- **No immutable audit log (R1).** Accepted for the milestone. Trigger: publication, grading, or real-account launch. Owner: [#5](https://github.com/abodacs/edu-canvas/issues/5), [#28](https://github.com/abodacs/edu-canvas/issues/28).
- **Database superuser can bypass RLS (I3, E4).** Accepted for the local and demo database. Trigger: production data. Owner: [#100](https://github.com/abodacs/edu-canvas/issues/100).

## Open items

GitHub issues own the work; the residual rows above own the details. The index is:

- EU residency of the selected generation provider ([#72](https://github.com/abodacs/edu-canvas/issues/72)).
- Signed demo session, then production authentication ([#74](https://github.com/abodacs/edu-canvas/issues/74), [#98](https://github.com/abodacs/edu-canvas/issues/98)).
- Per-teacher and per-tenant quotas; reconcile `fly.toml` with [AgDR-0007](../agdr/AgDR-0007-demo-access-and-deployment.md) ([#104](https://github.com/abodacs/edu-canvas/issues/104)).
- Teacher-bound idempotency lookups ([#131](https://github.com/abodacs/edu-canvas/issues/131)).
- Input moderation and personal-data handling ([#132](https://github.com/abodacs/edu-canvas/issues/132)).
- Production data role and tested restore path ([#100](https://github.com/abodacs/edu-canvas/issues/100)).

Threat IDs (S/T/R/I/D/E) are local to this document. They are unrelated to the design documents' E1–E8 evidence tasks.
