# AgDR-0023 — Identity boundary and test infrastructure

> In the context of deleting prose comments from `src/server/identity`, the identity matrix and policy-matrix harnesses, and the shared test setup (AgDR-0019), facing the loss of recorded security invariants, provider adapter rules, and harness hygiene that the types alone do not carry, I decided to consolidate the harvested decisions here, to keep every security boundary fail-closed and never an enumeration oracle, and to accept that this page is prose read at review time.

Recorded 2026-11-21. Harvested from code comments deleted by the comment-free-source sweep ([AgDR-0019](AgDR-0019-comment-free-source.md)).

## Identity boundary (`src/server/identity`)

- Identity error codes are application codes, never vendor codes; every code maps to one safe transport status and a message that never names another tenant's resource, owner, or existence. The single error type's message is always the safe message for its code, so a caller can serialize it without leaking server detail.
- Semantic identifiers are distinct branded types: brands stop a `TenantId` from being passed where an `ActorId` is expected, so accidental substitution fails to compile while deliberate tampering still fails the runtime ownership checks. A provider subject is the identity the provider issues — it proves nothing until a provider binding maps it to a server-owned `ActorId`.
- Capabilities are derived from the current membership and roster relationships on the server; a browser never supplies them. Session resolution is an exhaustive variant type: only the active variant carries an actor, because an "authenticated" boolean with an optional actor would let a failed check read as a session.
- Cookies: a fresh opaque credential carries at least 256 bits of randomness; the raw value reaches the browser once and only its one-way verifier is persisted. The session generation is a non-secret value used to key client caches and drop stale results. Development uses non-prefixed cookie names because `__Host-` requires a secure context; the retired demo cookie names cannot collide.
- Protected mutations require an exact trusted origin and a session-bound forgery token before any credential work (PC-02, AT-15, AT-17); arbitrary forwarded headers are never trusted — the browser's `Origin` must equal the configured origin. The forgery token is recomputable from the session id and the server secret, so it is stateless and cannot be reused for another session. Duplicate session cookies are rejected outright (AT-25). The pre-auth challenge is bound to a same-browser cookie.
- Credentials are encrypted with authenticated encryption whose ciphertext carries its key version, so rotation can decrypt live sessions with the previous key during a bounded rollout; a missing key invalidates affected sessions rather than falling back to plaintext. Decryption rejects truncated tags; encryption always writes this length. A missing rotation key invalidates the session rather than falling back.
- Refresh is internal to the adapter, never a browser endpoint. Only the worker that wins the revision check replaces encrypted credentials; a waiter re-reads the result; an ambiguous failure ends the local session rather than reusing a credential of unknown state. When the provider stops honouring the access token, exactly one bounded refresh runs before the session ends.
- Logout: local revocation first, provider sign-out best-effort for that specific session only — a provider outage must not turn a completed local logout into a failure. A logout that wins the revision check leaves the session revoked and its late credentials are discarded rather than written back.
- The hand-off list sorts deterministically ([#168](https://github.com/abodacs/edu-canvas/issues/168) P1-5): class name first, membership id as tiebreak, so two consecutive sign-ins present the same order regardless of store insertion order.
- New and duplicate addresses receive the same verification-pending state (AT-37), and unrecognized provider answers stay indeterminate, so neither sign-up nor sign-in reveals whether an account exists.
- Independent reads share one round trip: every verified request takes that path, so a serialized chain would add the full read latency each time.

## Rate limiting (`src/server/identity/rate-limit.ts`)

- The limiter is in-memory and process-local on purpose (one Machine, [AgDR-0007](AgDR-0007-demo-access-and-deployment.md)). A full table of live counters refuses the new key rather than evicting one: evicting would let an attacker clear a targeted account's throttle with enough distinct keys. The table is bounded and fails closed.
- Counters are time-limited; the window resets, so no permanent lock exists. Bucket keys are FNV-1a digests over the normalized address — stable and non-reversible, not cryptographic — with a salt so raw addresses and emails are never stored.

## Provider adapters (`src/server/identity/provider`)

- The deterministic provider is in-memory and used by tests and explicit local development tooling; it implements the same contract as the hosted adapter so application behavior is exercised without a live vendor. It can never supply authority to a deployed request: config forces the hosted provider outside development, so the deterministic provider is constructed only where the caller chooses it.
- The hosted adapter splits an anon-key client (every end-user flow: sign-in, sign-up, refresh, get-user) from a service-role client used only to revoke one provider session on sign-out. Passwords are transient request data and never leave the method calls that receive them.
- A fresh `AbortSignal.timeout` is composed into the fetch the SDK uses, so every request fails closed once the timeout elapses; the GoTrue client issues exactly one request per auth call, so this bounds the total provider call.
- A transport failure is anything the provider never answered for: a network error or timeout (status 0), an error with no HTTP status, or a 5xx outage — these fail closed as `unavailable` rather than as a credential rejection.
- JWT claims are read without signature verification only for non-security-critical fields (session id, subject consistency); authority always comes from the provider's own `getUser`/`signIn` responses. Confirming the bound provider session still exists is the authoritative provider-status check; a locally live session does not prove provider validity. Provider codes that mean "password did not match" are listed explicitly so everything else stays indeterminate.

## Identity matrix and policy-matrix harnesses (`authentication-matrix.test.ts`, `policy-matrix.test.ts`)

- The authentication matrix drives the real HTTP handlers for AT-01..38 against seeded persistence and the deterministic provider; no policy is stubbed. The only substituted collaborators are a persistence that fails a store write, a provider that reports a different subject, and lowered rate-limit counters.
- Deferred rows register with `it.skipIf` rather than a disabled-test modifier: the repo's vitest preset reports the skip modifier (`vitest/no-disabled-tests`) and pending-test modifier as errors, and errors on an empty test body too. The case name still carries the row id and the body asserts the required behaviour, so un-skipping it fails until the surface lands.
- AT-27 and AT-28 skip notes described "no learner-reachable protected endpoint exists on this branch" — stale since the learner delivery seam landed ([#6](https://github.com/abodacs/edu-canvas/issues/6)); re-audit owed, tracked by the sweep follow-up issue. AT-23 and AT-26 skip notes recorded observed divergences (logout takes no target session id; the strict schema answers role-override probes with 422 before any 403 rule can apply).
- The policy matrix drives PT-01..57 at the real delivery seams with real requests and cookies, or through the real persistence conditional writes and session revision checks; the authorization policy is never stubbed. Deferred rows name the release-unit-B issue that owns them; no endpoint is invented.
- `PRODUCTION GAP` rows recorded observed responses that differ from the §12 matrix requirement (404 `DRAFT_NOT_FOUND` and 422 `GENERATION_INPUT_INVALID` from the [#115](https://github.com/abodacs/edu-canvas/issues/115) mapping, 500 from `mapGenerationError`, 204 logout behaviour, membership revocation surfacing as an authentication boundary via `buildActor`) — each kept as a skipped body holding the exact assertion the matrix requires, so fixing the named handler un-skips a real check. These divergences are now indexed by the sweep follow-up issue instead of prose beside the rows.
- Publish response conformance: the response must satisfy the published contract, not a local copy — a dropped field was a 502 in the browser after a successful publish. The body schemas are the boundary, so an unknown key is a refusal rather than something an inner parse silently strips.
- A fresh composition per test keeps the shared sign-in rate limiter from marching every case into 429; the seeded identity store stays cached.

## Test infrastructure (`src/test-environment.ts`, `src/test-setup.ts`, `src/test-shared-setup.ts`, `database-test-support.ts`)

- `test-environment.ts` gives tests that read `process.env` or compose from configuration a hermetic server environment: the database URL is never dialled, identity tests inject the in-memory identity store through `buildConfiguredIdentity`, and the provider key only satisfies configuration validation. CI parity requires pinning `AUTH_PROVIDER` where seams read the environment.
- Shared workers run many non-mocked files in one process, so `test-setup.ts` undoes the process-wide changes vitest knows how to undo before the next file runs, and `test-shared-setup.ts` clears the module-scoped identity limiter — its counters would otherwise accumulate across every shared file in the worker and rate-limit whichever file runs once the window fills.
- Database contract tests gate themselves on `RUN_DATABASE_TESTS` and a configured `DATABASE_URL`; the transaction helper sets the tenant-local session variable every row-level policy expects and resolves postgres.js's tuple unwrap through an explicit `Promise<T>`.
- The synthetic identity fixture is idempotent (safe to replay: one actor, membership, and binding per entry), and test-support actors mirror it so tests can stand in for a resolved session without provisioning the whole composition; they live outside the production import graph — nothing in `src` imports them.
- The advisory-review eval cases and `semantic-validation-fixtures.ts` are test-support modules placed outside production modules so generation no longer imports seed data; the latter keeps the seed tenant as the default so a test never has to name one, and production resolves through `resolveCurriculumContext` returning `undefined` instead.

## Alternatives considered

- **Keep these as comments** — rejected by [AgDR-0019](AgDR-0019-comment-free-source.md); the guards, the matrix rows, and the setup files are the executable owners, this record is the review-time index.

## Consequences

- Security review can read one page instead of grepping `src/server/identity`.
- The AT/PT deferral ledger now lives in this record plus the sweep follow-up issue; the stale AT-27/28 rows are owed a re-audit.

## Handoff

[AgDR-0009](AgDR-0009-application-owned-opaque-sessions.md) owns application-owned opaque sessions. The threat model owns the STRIDE mapping; the identity vocabulary is in the [identity glossary](../../../src/server/identity/GLOSSARY.md). The sweep follow-up issue [#264](https://github.com/abodacs/edu-canvas/issues/264) owns the AT-27/28 re-audit and the PRODUCTION GAP index.
