# AgDR-0006 — Provider selection and bounded deadlines

> In the context of the hackathon-2026 release requiring an event-allowed model and three external services, facing the risk of asserting an unproven model, unbounded calls, or silent retries that corrupt request ownership, I decided to select the provider through an explicit, proven interface choice — an event-allowed Meta model behind the existing generation boundary, named only after access is proven — with per-operation deadlines, at most one correction, and idempotent operation keys, to achieve an honest, recoverable integration, accepting that no exact model identifier is claimed to work until V1/V3 evidence exists and that provider failure can force labeled fixtures instead of live generation.

Recorded 2026-10-25 for the hackathon-2026 reconciliation ([#89](https://github.com/abodacs/edu-canvas/issues/89)). Normative contracts live in the [implementation document](../design/design-doc-implementation.md).

## Context

The July 2026 build used OpenAI GPT-5.6 under the Devpost requirement. That provider is retired: the Meta hackathon requires an allowed Meta model, and the runtime now builds only the Meta adapter. Access, latency, and contract compatibility were proven on 2026-10-27 ([evidence](../hackathon/meta-global-2026/evidence/ic1-2026-10-27/README.md)). Meanwhile the pipeline adds Learning Commons, Jev, and upload extraction, each of which can hang or fail.

## Decision

Keep the provider interface and use Meta's `muse-spark-1.2-contributor` behind it, through Meta's OpenAI-compatible Responses endpoint (`https://api.meta.ai/v1`). The model identifier lives in configuration and in every draft's provenance (`provider: meta`). Fixtures stay explicitly labeled and separate from live mode. Settings are `META_API_KEY`, `META_MODEL`, `META_BASE_URL`, and `META_TIMEOUT_MS`; the earlier `OPENAI_*` names are removed, so deployments must re-set the secret (`fly secrets set META_API_KEY=…`).

Every external operation has an explicit deadline and a single recovery path, and no hidden transport retries:

| Operation | Deadline | Recovery |
| --- | --- | --- |
| Learning Commons sequence | 10 s total | One teacher-requested retry, then upload |
| Jev match | 5 s | Manual confirmation after failure |
| Upload extraction | 10 s | Correct or replace the file |
| Model generation + one correction | Up to 200 s total (100 s per call; the current adapter has no separate total deadline) | At most one correction for invalid output |
| One model call | 100 s | Explicit retry; no hidden transport retry |

**Event decision, 2026-10-27:** raise the per-call timeout to 100 s. The selected Meta model takes about 20–47 s for the full draft contract. This supersedes the earlier 10 s per call and 25 s total for the event run. #105 must record the contract change before acceptance.

Source resolution completes before the generation claim begins; the remaining lease time is reserved for validation and persistence. Every operation key persists its normalized request hash: same key and same request return the original result; same key with a changed request returns `IDEMPOTENCY_CONFLICT`. Late responses after lease expiry or ownership loss are rejected.

A timeout or rate limit offers an explicit teacher retry with a new operation key linking to the failed request. A moderation block requires a revised request, never a retry. If live access fails, a clearly labeled recording or fixture may explain, but it cannot establish live generation, eligibility, or a passed V3 check.

## Consequences

- Claims about model behavior cite the V1/V3 evidence records.
- Provider cost and latency are bounded per request and per demo run.
- Request ownership survives retries, reloads, and concurrent claims.
- The OpenAI-to-Meta migration touched only the adapter and settings names; fixtures and stored records are unchanged (`provider` is free text in provenance).

## Handoff

Access and eligibility evidence is recorded in the [validation tracker](../hackathon/meta-global-2026/validation-tracker.md) under V1/V3. Deployment of the chosen provider is covered by [AgDR-0007](AgDR-0007-demo-access-and-deployment.md). The grounded package contracts are in [AgDR-0005](AgDR-0005-grounded-package-version-contracts.md).
