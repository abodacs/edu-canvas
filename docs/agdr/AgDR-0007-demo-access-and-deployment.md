# AgDR-0007 — Single-instance demo access and deployment

> In the context of publishing a reviewer-accessible validation deployment on the existing Fly.io + Supabase foundation, facing the risk that the older two-instance runbook silently invalidates process-local limits and that an open endpoint invites unbounded cost and access, I decided to deploy one continuously running Fly.io instance with database-backed quotas, process-local burst limits, and protected invitation sessions, to achieve a controlled, honest validation deployment, accepting reduced availability versus a multi-instance setup and that this configuration is explicitly a milestone stage; production requirements live in the release runbook.

Recorded 2026-10-25 for the hackathon-2026 reconciliation ([#89](https://github.com/abodacs/edu-canvas/issues/89)). Normative contracts live in the [implementation document](../design/design-doc-implementation.md#apply-access-limits-and-safe-release-changes); the runbook now follows this decision.

## Context

Design decision [Q12](../design/design-doc-questions.md) selected one continuously running Fly.io instance because the demo's request limits are process-local and SSE preview delivery is stateful per request. The release runbook still instructed `fly scale count 2` and said nothing about quotas. A public demo also needs protected sessions — a browser-supplied role is insufficient (Q16) — and bounded generation cost.

## Decision

Deploy exactly one continuously running application Machine in the primary region, with Supabase Postgres as the external storage boundary and the migration runner as a Fly release command. Scaling out requires shared request-limit state first; that state is not built for the demo, so `fly scale count 1` replaces the earlier two-instance instruction.

Access is protected by separate teacher and learner invitation credentials exchanged for signed, HttpOnly, Secure, SameSite session cookies; identity and role derive from the server session only. No invitation credential appears in client bundles or repository files.

Usage is bounded at two layers:

- **Database-backed quotas (Postgres counters):** at most 10 generation attempts per teacher per hour and 100 per tenant per day; corrections count against the provider-call budget; all generation stops at 200 provider calls per tenant per day.
- **Process-local burst limits:** at most 30 authoring requests per session per minute; at most one active generation per teacher. Rejected requests return `RATE_LIMITED` with a stated retry interval.

These defaults bound demo use; they are not measured production limits. Measure costs before changing them.

## Consequences

- The deployment matches the design's limit model; no limit can be bypassed by a second Machine.
- Judge access is reproducible from an independent browser or device, with reset and recovery rehearsed (V9).
- A single Machine is a deliberate availability trade for the demo window, not a defect.
- The runbook makes no production-readiness or availability claim; the pre-production gate stays in the runbook.

## Handoff

The [release runbook](../release-fly-supabase.md) owns the operating procedure; AC20 and V9 verify access and quota behavior. Provider selection and deadlines are in [AgDR-0006](AgDR-0006-provider-selection-and-deadlines.md). Real-user launch remains blocked on the runbook's pre-production list.
