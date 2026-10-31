# Architecture harness

`pnpm verify:architecture` protects the current structure as a communication contract. It is intentionally small and specific to the repository’s current seams. `pnpm verify:boundaries` ([dependency-cruiser](../../../.dependency-cruiser.cjs)) complements it with whole-graph checks the regex scan cannot make.

## Guardrails

- **State ownership:** common global-store imports, store constructors, and unowned `store.ts`/`global-state.ts`/`app-state.ts` modules fail the check. Local UI state remains allowed.
- **Layer ownership:** shared modules cannot import server, route, UI, Node, or PostgreSQL code; UI modules cannot import runtime behavior; server modules cannot import delivery or UI modules.
- **Named delivery seams:** route modules may import only `.server` modules or `/server-function` modules from the server tree.
- **Private entry points:** every HTTP route under `src/routes/api` is classified. `auth`, `health`, and `readiness` may serve anonymous callers; every other route must reach a server delivery module that resolves the caller's session (`scripts/verify-identity-surface.ts`). A new private route that forgets authentication fails the check.
- **Contract ownership:** public projections are parsed by their shared schema at the server seam (`sessionProjectionSchema` for the authenticated session).

## Dependency boundaries (verify:boundaries)

The two scanners split the work: `verify:architecture` owns the layer and state conventions above; `verify:boundaries` cruises the full `src/` import graph and owns what needs graph knowledge.

- **No dependency cycles** (excluding the generated `routeTree.gen.ts`, whose edge to `router.tsx` the router plugin owns).
- **Context decoupling:** `src/server/generation` and `src/server/a2ui` may not import each other’s logic; the persistence record (and its types) is their meeting point.
- **Database-client ownership:** only `src/server/persistence` imports `postgres`.
- **Test-double containment:** runtime modules may not import the in-memory persistence doubles (`persistence/seeded.ts`, `source-seeded.ts`, `identity-seeded.ts`). Only `.test.ts(x)` modules and the doubles' own modules may; the rule is an error (`runtime-imports-in-memory-store`).
- **Layer rules mirrored** from `verify:architecture`, so a bypass via a resolved path cannot slip past one scanner.

## Identity boundary (#98)

The identity boundary replaced browser-selected demo roles. Its rules:

- `src/server/identity/` owns verification, session establishment and resolution, expiry, logout, and trusted provisioning. It has no UI imports.
- A browser never supplies an actor. Protected delivery resolves an actor from the session and passes it to a domain operation; no route or component selects a role, tenant, or learner.
- Only a verified teacher actor reaches generation: the command type rejects a learner at compile time, and the delivery seam re-checks the role at runtime.
- The provider sits behind an application-owned adapter. The deterministic provider is reachable only in development; preview and production require the hosted provider, so synthetic fixtures cannot supply authority to a deployed request.
- `verify:identity-surface` is the entry-point gate. Its limit: it classifies routes statically and does not classify referents (drafts, rosters, publications, activity versions); those ownership checks live in each delivery module and the PT matrix.
- The migration's pre-tenant credential lookup is a `security definer` function. The least-privilege role split that makes it safe belongs to [#100](https://github.com/abodacs/edu-canvas/issues/100); until it lands, the application connects as the table owner and the function is documented in `drizzle/0003_identity_definer_functions.sql`.

## Safety context (#28)

`src/server/safety/` owns the artifact gate: gate verdicts, findings, the renderable-artifact brand, the single recovery policy, stored-artifact re-derivation, and the structured refusal shape.

- **Allowed imports:** `src/shared/` contracts; `src/server/generation/types.ts` and `src/server/generation/validation.ts` (record contracts and the structural validator only); `node:crypto`.
- **Generation depends on safety.** Draft acceptance calls `gateArtifact`; a draft cannot become `ready-for-review` without a passing snapshot.
- **Preview depends on safety.** `preview.server.ts` re-derives the gate with `gateStoredArtifact` and compiles only `gateOutcome.result.renderable`. The compilers accept the branded `RenderableArtifact`; `compileRawLessonPreview` and `compileRawFractionPreview` are the test and differential-oracle seam, not production entry points.
- **Safety depends on generation only for contracts.** It must not import generation orchestration (service, provider, projection) or the preview context.
- **One recovery table.** `recovery-policy.ts` owns every code-to-recovery decision and the single recovery priority order (retry, then replace, then edit).
- **Edit rerun seam.** When the edit endpoints land, the rerun path is `gateStoredArtifact` plus re-acceptance. A stored draft is never compiled or shared without a fresh gate result and a matching acceptance snapshot.
- **Ownership limit.** The compile guard sees the rendered projection only. A draft or semantic rule it cannot observe stays with the gate; the differential oracle records each such case instead of weakening the gate.

## Publication context (#5)

`src/server/publication/` owns the generated-pack review path: immutable review versions, per-target approvals, the publication fact, the learner assignment, and the delivery seam.

- **Allowed imports:** `src/shared/` contracts; `src/server/safety/artifact-gate.ts` and `artifact-enforcement.ts`; `src/server/generation/types.ts` and `src/server/generation/validation.ts` (record contracts and the structural validator only); `src/server/persistence/` pack port and generation port types; `src/server/identity/types.ts`; `src/server/a2ui/compiler.ts` for the branded version preview; `node:crypto`.
- **One version owner.** A review revision is a `pack_versions` row. An edit inserts a new row with a parent link; nothing updates or deletes a row. The generation record stays generation-owned.
- **Approval is per target.** Four variant approvals and one reverse-path approval are pinned to the version's artifact hash and validation-result hash. Publish refuses a stale hash or a missing target.
- **Publish re-derives.** The service re-runs `gateArtifact` over the stored revision, compares the artifact hash and gate policy version, and only then writes one publication and one assignment. Receipts and unique keys make a retry return the same records.
- **Private answers stay private.** `src/shared/publication-contract.ts` has no relationship or answer-key field; the payload scrub test fails if one appears in the review projection.
- **Read-only referents.** Pack adapters read `identities` to validate an assignment learner and `class_assignments` is not consulted yet. Identity owns every identity write; the pack context only reads an active student in the tenant.
- **One assignment per publication.** `pack_assignments` is unique per `(tenant, publication)`, so one publication can reach one learner. Class-roster filtering is #6/#98 scope.
- **Ownership limit.** The review projection is teacher-scoped at the delivery seam; the learner assignment read belongs to #6. The `pack_*` names are temporary until AgDR-0012's reconciliation with #144 lands.

Severity contract: error rules must stay green in every PR. Warn rules are named boundary debt — each comment states the migration wave that retires it (see the [context migration waves](../ARCHITECTURE.md#target-layout-and-migration-waves)). A new warn outside a planned wave is a review blocker; flipping a warn to error is part of its wave. Context rules apply to production modules; test modules may assemble cross-context fixtures.

The harness is not a substitute for review. When a new global state holder or cross-seam import is genuinely required, give it a named owner, record the reason in the relevant architecture decision, and then update this harness deliberately.
