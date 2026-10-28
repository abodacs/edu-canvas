# AgDR-0009 — Application-owned opaque sessions behind a provider adapter

> In the context of replacing browser-selected demo roles with real authentication for issue [#98](https://github.com/abodacs/edu-canvas/issues/98), facing the risk that an untrusted browser role or a locally live session would be mistaken for authority, I decided to adopt an application-owned opaque session credential behind an application-owned provider adapter (Supabase Auth as the initial provider), to achieve a single revocation boundary and a replaceable provider, accepting per-request session persistence and an authoritative provider-status check on every protected request.

Recorded 2026-10-28 while implementing the consolidated [#98](https://github.com/abodacs/edu-canvas/issues/98) specification. The specification in `.scratch/tasks/98-login/98-authentication.md` is the source of the contracts; this record explains why the session shape was chosen.

## Context

The deployed product selected a role in the browser (`/demo/$role`) and mapped it to a seeded identity. No credential was verified, so a caller could choose teacher permissions. Postgres already scopes rows by a transaction-local `app.tenant_id` that the server sets, so a login screen alone cannot repair an untrusted server-side tenant choice.

Two session shapes were considered:

1. **Provider-owned browser session.** The browser stores provider credentials and the server verifies the provider on each request. It minimises local storage, but splits revocation across two systems and complicates shared-device cleanup.
2. **Application-owned opaque session.** The provider handles email/password sign-in and teacher sign-up; the browser receives only an opaque application credential; the application owns establishment, resolution, expiry, and logout.

The provider itself still needs a check. Supabase documents comparing a token's session identifier against its session store to detect sign-out, and a locally live session does not prove time-box or idle validity.

## Decision

Adopt the application-owned opaque session.

- The browser holds a host-only, Secure, HttpOnly, SameSite=Lax credential of at least 256 bits. Only a one-way verifier of that credential is persisted; the reusable value is never stored.
- The provider adapter is application-owned. Supabase Auth is the initial provider, pinned at `@supabase/supabase-js` 2.118.0, selected only by configuration. Passwords are transient request data and are never persisted or logged.
- Provider access and refresh credentials are stored encrypted with authenticated encryption under a deployment key that carries a key version, so rotation can decrypt live sessions during a bounded rollout. A missing key invalidates affected sessions rather than falling back to plaintext.
- Every protected request resolves the local session **and** confirms the bound provider session through a narrow, server-owned lookup. The provider check has a five-second total timeout and fails closed with `503 AUTH_UNAVAILABLE`. Application expiry remains authoritative; there is no positive validity cache in this release.
- Revocation is local-first: a session is revoked atomically, then the provider is asked to end that specific session only — never an implicit global sign-out. A provider failure still completes the local logout.
- An actor with several memberships first enters a five-minute pending state that cannot authorize domain operations; selection re-checks ownership and status, consumes the pending authority, and rotates into a new credential.
- Only a verified teacher actor can reach generation; the type system rejects a learner actor at compile time, and the delivery seam re-checks the role at runtime.

## Consequences

- Revocation has one boundary. A write authorized before a revocation, but committed after it, fails; a write committed first is not retroactively undone.
- Per-request provider checks and transactional authorization add latency and load in exchange for that boundary. The release model runs one Machine (see [AgDR-0007](AgDR-0007-demo-access-and-deployment.md)); scaling out requires the shared limit state that document names.
- The provider is replaceable: the deterministic provider used by tests and local development implement the same contract, so application behaviour is exercised without a live vendor. It cannot supply authority to a deployed request because configuration forces the hosted provider outside development.
- The least-privilege database role split that makes the pre-tenant credential lookup safe belongs to [#100](https://github.com/abodacs/edu-canvas/issues/100); the pre-tenant lookup function exists for that step and is documented in the migration.
- Deployment, rollback, recovery, and monitoring gates remain open. This decision records the session shape; it does not claim production readiness.

## Alternatives rejected

- **Stateless signed tokens.** Immediate local revocation would require either a blocked-token list or short token lifetimes, pushing the revocation boundary back to a second store.
- **A generic authorize-everything dispatcher.** Domain operations own their own resource relationships; a single dispatcher would need to know every relationship and would hide ownership errors.
- **A role or tenant carried by the browser.** The exact failure being removed.

## Handoff

Requirements for the identity contract live in the #98 specification (§5–§10). The [threat model](../security/threat-model.md) and the [architecture harness](../architecture-harness.md) describe the enforcement points. [#99](https://github.com/abodacs/edu-canvas/issues/99) consumes the provisioning operations for teacher onboarding; [#101](https://github.com/abodacs/edu-canvas/issues/101) owns consent and minor-data permissions.
