# AgDR-0003 — Server-only observability with scrubbed Sentry delivery

> In the context of diagnosing server failures without exposing children’s data or deployment secrets, facing the risk that error context becomes a second data-leak path, I decided to put structured logging and an environment-gated Sentry reporter behind one server-only seam with scrubbing before delivery, to achieve actionable failure visibility with a safe fallback, accepting that this slice does not provide metrics, dashboards, or product analytics.

## Context

The foundation currently returns safe health/readiness payloads, but the PostgreSQL readiness path discarded the underlying error and configuration failures had no structured operator signal. Operators need enough context to diagnose a broken deployment, while Edu-Canvas must not send student identifiers, answer keys, request bodies, credentials, database URLs, or other sensitive values to a vendor.

## Decision

- `src/server/observability.server.ts` is the single server observability seam.
- Structured server-error events are always emitted through the logger boundary.
- Sentry is enabled only when a valid server-side `SENTRY_DSN` is configured. The DSN is never included in a public readiness payload, log event, or client bundle.
- Sentry receives a newly constructed, scrubbed `Error` and the already-scrubbed allowlisted context. The SDK is initialized lazily with `defaultIntegrations: false`, `sendDefaultPii: false`, an isolated cleared scope, and a final `beforeSend` scrubber so uncaught-error/request integrations cannot bypass the seam.
- The scrubber redacts sensitive keys (including student/child identity, contact data, credentials, database, token, answer-key, score, request-body, and raw-data fields), plus sensitive values recognizable in strings such as emails, bearer tokens, credentialed URLs, identifiers, and UUIDs.
- If Sentry is absent or its boundary throws, the structured log remains the source of truth and the application error path is not replaced by a telemetry failure.
- Health/readiness and PostgreSQL readiness failures use the seam with stable operation names and safe reason/code context.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **A. One scrubbed server seam with optional Sentry** | Consistent policy; structured logs work everywhere; vendor can be replaced; easy to test at the boundary | Requires maintaining the scrubber and a small adapter |
| B. Call Sentry directly from each server module | Quick initial wiring | Duplicated policy; easy for one path to leak data or skip fallback |
| C. Log raw errors and rely on vendor-side redaction | Preserves more debugging detail | Sends sensitive data outside the process before it can be controlled; rejected |
| D. Add metrics and dashboards now | Broader operational picture | Expands this slice beyond error visibility; deferred |

## PII and secret policy

The event contract is diagnostic, not a copy of the request. Callers may provide an operation, safe error code, dependency, and reason. Student identity, names, contact data, answer keys, scores, raw request data, credentials, and database details are not valid observability data. The seam applies key- and value-based redaction before both the logger and Sentry reporter, so the fallback and vendor paths share the same policy.

## Consequences

- + A deliberate server failure produces a stable structured event for local logs and a scrubbed Sentry event when configured.
- + PostgreSQL and readiness failures retain user-safe HTTP behavior while becoming diagnosable to operators.
- + Client-boundary checks explicitly reject Sentry and observability markers, the DSN variable, and seeded identity markers in browser output.
- − Error messages and stacks may lose useful detail when they contain sensitive-looking values; operators should use operation names and safe codes for correlation.
- − This is error visibility only. Metrics, alerting dashboards, product analytics, and vendor calls outside the seam remain out of scope.

## Security review sign-off

- Status: approved for merge.
- Reviewer: Codex implementation security review.
- Date: 2026-07-17.
- Evidence: `pnpm check` passed (25 tests, production build, client-boundary verification, and architecture verification); QA verified healthy routes plus a secret-free structured readiness failure; the audit found no P0–P3 issues.
- Deployment requirement: configure `SENTRY_DSN` only as a server-side HTTPS environment variable when vendor delivery is intended; otherwise retain the structured-log fallback.
