# Deadline, idempotency, and ownership conformance — 2026-10-27

**Issue:** [#105](https://github.com/abodacs/edu-canvas/issues/105). **Purpose:** record the deterministic behavioral matrix for AgDR-0006 deadlines, idempotency, cancellation, moderation, and request ownership. **Revision under test:** `3f2fc2b19527ce6e69e594a14976b4030100418c`. **Date:** 2026-10-27.

This record proves orchestration behavior with a controlled provider, a virtual clock, and both persistence adapters. It does not repeat the live Meta request; [#115](https://github.com/abodacs/edu-canvas/issues/115) owns that trace.

## Contract change record

The original issue matrix required 10 seconds per call, 25 seconds total, and a 30-second lease. [AgDR-0006](../../../../agdr/AgDR-0006-provider-selection-and-deadlines.md) records the event decision on 2026-10-27:

| Operation                            | Current contract  | Superseded value |
| ------------------------------------ | ----------------- | ---------------- |
| One model call                       | 100 seconds       | 10 seconds       |
| Model generation plus one correction | 200 seconds total | 25 seconds       |
| Claim lease                          | 220 seconds       | 30 seconds       |

The live Meta draft took 33.467 seconds. The code constants are `generationPerCallBudgetMs`, `generationTotalBudgetMs`, and `generationClaimLeaseMs` in `src/server/generation/types.ts`. The conformance suite pins all three values.

## Environment

| Field | Value |
| --- | --- |
| Revision | `3f2fc2b19527ce6e69e594a14976b4030100418c` |
| Node | v26.8.1 |
| pnpm | 10.17.1 |
| Database | Docker `postgres:17-alpine`, `127.0.0.1:5432` |
| Persistence adapters | `postgres` and `drizzle` |
| Provider | Controlled in-process provider; injectable fetch for adapter checks |
| Mode | No live model call, no wall-clock sleep |

## Behavioral matrix

All checks run from `pnpm exec vitest run src/server/generation/service-conformance.test.ts` unless noted. Each check asserts provider calls, operation identity, and final persisted state.

| Case | Check name | Contract clause | Observed result | Limit |
| --- | --- | --- | --- | --- |
| Identical concurrent requests and replay | `reuses one operation and one provider call for identical concurrent requests and replay` | Same key and input return the original result | 1 provider call, 1 attempt, 3 callers share one request ID | In-memory persistence |
| Concurrent correction | `counts at most two calls across concurrent correction requests` | At most one correction across all callers | 2 calls, 1 attempt, `ready-for-review` | In-memory persistence |
| Changed input after completion | `rejects changed input under the same key after completion without a call or mutation` | `IDEMPOTENCY_CONFLICT`; no call or mutation | Typed conflict; calls stay at 1; stored record is byte-for-byte equal | In-memory persistence |
| Changed input while in flight | `rejects changed input under the same key while the first request is in flight` | Conflict before a second call | Typed conflict; calls stay at 1; the first request still finishes | In-memory persistence |
| Canonical request hash | `hashes the normalized request canonically` | Persist the normalized request hash | Key order does not change the hash; a changed prompt does | Hash is not a cryptographic digest |
| Stale owner before and after replacement | `rejects a stale owner write before and after a replacement claim` | Late work cannot replace a newer owner | Attempt-1 write rejected before and after attempt 2 becomes ready; stored record unchanged | In-memory persistence |
| Lease expiry without replacement | `rejects a write paused across lease expiry without a replacement owner` | Every write requires an unexpired lease | Write at the lease boundary is rejected; a write inside it succeeds | In-memory persistence |
| Per-call deadline | `aborts a hanging initial call exactly at the 100-second per-call deadline` | 100 seconds per call | Not aborted at 99,999 ms; aborted at 100,000 ms; 1 call; `failed-retryable` + `PROVIDER_TIMEOUT` | Virtual time |
| Correction deadline | `aborts a hanging correction at the per-call deadline and never calls a third time` | One correction, then stop | 2 calls; no third call; retry state keeps both diagnostic sets | Virtual time |
| Total deadline | `aborts a hanging correction at the cumulative 200-second deadline` | 200 seconds across generation plus correction | First call at 120 s, second call still pending at 199,999 ms, aborted at 200,000 ms; 2 calls; `GENERATION_DEADLINE_EXCEEDED` | Virtual time; per-call raised to 150 s to expose the total bound |
| Cancellation, abort-ignoring provider | `cancels in flight, ignores a late ignore-abort response, and keeps the cancelled record` | Cancel in flight; late response cannot commit | Abort requested; 1 call; cancelled record persists after the late draft arrives | Service seam; no UI control |
| Cancellation, abort-respecting provider | `cancels in flight, ignores a late respect-abort response, and keeps the cancelled record` | Same | Abort requested; 1 call; cancelled record persists | Service seam; no UI control |
| Cancel completed request | `does not add a call when cancelling an already completed request` | Cancellation is teacher-scoped and idempotent | `ready-for-review` remains; 1 call | In-memory persistence |
| Retry after timeout | `links an explicit teacher retry after timeout to a new key without extra calls on replay` | New key linked to the failed operation | 2 calls total; attempt 2; replaying either key adds no call; attempt 1 diagnostics remain | In-memory persistence |
| Retry after rate limit | `links an explicit teacher retry after rate-limit to a new key without extra calls on replay` | Same | 2 calls total; `PROVIDER_RATE_LIMIT` remains on attempt 1 | In-memory persistence |
| Prompt moderation | `requires revised input after a prompt moderation block` | Moderation requires revised input | 0 calls; unchanged input under a new key returns `MODERATION_REVISION_REQUIRED`; original block persists | In-memory persistence |
| Revised prompt | `accepts revised input after a prompt moderation block` | A revised request is a new operation | 1 call; `ready-for-review` | In-memory persistence |
| Output moderation | `does not correct or re-call for an unchanged request after output moderation` | No correction or unchanged retry | 1 call; unchanged new-key request rejected; calls stay at 1 | In-memory persistence |
| Retry after moderation | `refuses a retry of a moderation-blocked request` | A moderation block never becomes a retry | `MODERATION_REVISION_REQUIRED` | In-memory persistence |
| Durable lease and moderation lookup | `rejects a write past the lease and accepts one inside it`; `finds a moderated request by its persisted request hash` | Atomic durable ownership and moderation lookup | Both `postgres` and `drizzle` adapters pass; hash round-trips | Local Docker Postgres 17 |

## Transport inspection

`src/server/generation/provider.ts` calls the Responses endpoint once per `generate` call. The adapter has no retry loop. The service passes an `AbortSignal`; the adapter combines it with `AbortSignal.timeout(timeoutMs)` through `AbortSignal.any`.

| Check | Observed result |
| --- | --- |
| `sends exactly one outbound attempt for a 429 response` | 1 fetch attempt; rate-limit error; no retry |
| `sends exactly one outbound attempt for a 500 response` | 1 fetch attempt; transient error; no retry |
| `propagates the caller signal to the outbound transport` | Outbound signal aborts; 1 attempt; safe timeout error |
| `aborts a hanging transport at the configured timeout with one attempt` | Abort at 5 ms; 1 attempt; safe timeout error |

Limits: the selected Meta transport is not exercised here. [#115](https://github.com/abodacs/edu-canvas/issues/115) owns the live transport evidence. The event transport must retain the same one-attempt behavior.

## Migration

`migrations/0003_generation_request_hash.sql` adds a nullable `request_hash` column and a tenant/hash index. New attempts always store the hash. Legacy rows remain readable; the codec derives the hash from the stored request fields. The moderation lookup matches stored hashes only, and no legacy row was both moderated and hash-less because moderation tracking is new.

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm check` | PASS. Format, lint, type checks, 165 tests, build, client boundary, architecture, and dependency checks passed. 5 pre-existing dependency warnings, 0 errors. |
| `pnpm test:coverage` | PASS. All files: 85.32% statements, 77.41% branches, 85.44% functions, 85.17% lines. Thresholds: 50/65/46/50. |
| `RUN_DATABASE_TESTS=true pnpm test:database` | PASS. 10 tests across the `postgres` and `drizzle` adapters. |
| `pnpm db:drizzle:check` | PASS. |
| `pnpm verify:lesson-gate` | PASS. 4 property checks. |
| `pnpm exec vitest run src/server/generation/service-conformance.test.ts` | PASS. 23 checks. |

## Limits and next evidence

- Cancellation is proven at the service seam. The focused teacher UI has no cancel control.
- Semantic validator coverage and content quality are unchanged; this record covers orchestration only.
- The durable checks ran on a local Docker Postgres 17 instance, not production.
- The live Meta endpoint and official eligibility evidence remain [#115](https://github.com/abodacs/edu-canvas/issues/115) and V1 scope.
- A real two-instance cancellation race is not tested. Atomic writes and lease checks make a late cross-instance write fail, but the provider call may still finish remotely.
