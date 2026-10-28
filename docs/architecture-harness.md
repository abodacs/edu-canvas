# Architecture harness

`pnpm verify:architecture` protects the current structure as a communication contract. It is intentionally small and specific to the repository’s current seams. `pnpm verify:boundaries` ([dependency-cruiser](../../../.dependency-cruiser.cjs)) complements it with whole-graph checks the regex scan cannot make.

## Guardrails

- **State ownership:** common global-store imports, store constructors, and unowned `store.ts`/`global-state.ts`/`app-state.ts` modules fail the check. Local UI state remains allowed.
- **Layer ownership:** shared modules cannot import server, route, UI, Node, or PostgreSQL code; UI modules cannot import runtime behavior; server modules cannot import delivery or UI modules.
- **Named delivery seams:** route modules may import only `.server` modules or `/server-function` modules from the server tree.
- **Private entry points:** every HTTP route under `src/routes/api` is classified. `auth`, `health`, and `readiness` may serve anonymous callers; every other route must reach a server delivery module that resolves the caller's session (`scripts/verify-identity-surface.ts`). A new private route that forgets authentication fails the check.
- **Contract ownership:** public projections are parsed by their shared schema at the server seam (`sessionProjectionSchema` for the authenticated session, `demoSnapshotSchema` historically).

## Dependency boundaries (verify:boundaries)

The two scanners split the work: `verify:architecture` owns the layer and state conventions above; `verify:boundaries` cruises the full `src/` import graph and owns what needs graph knowledge.

- **No dependency cycles** (excluding the generated `routeTree.gen.ts`, whose edge to `router.tsx` the router plugin owns).
- **Context decoupling:** `src/server/generation` and `src/server/a2ui` may not import each other’s logic; the persistence record (and its types) is their meeting point.
- **Database-client ownership:** only `src/server/persistence` imports `postgres`.
- **Layer rules mirrored** from `verify:architecture`, so a bypass via a resolved path cannot slip past one scanner.

## Identity boundary (#98)

The identity boundary replaced browser-selected demo roles. Its rules:

- `src/server/identity/` owns verification, session establishment and resolution, expiry, logout, and trusted provisioning. It has no UI imports.
- A browser never supplies an actor. Protected delivery resolves an actor from the session and passes it to a domain operation; no route or component selects a role, tenant, or learner.
- Only a verified teacher actor reaches generation: the command type rejects a learner at compile time, and the delivery seam re-checks the role at runtime.
- The provider sits behind an application-owned adapter. The deterministic provider is reachable only in development; preview and production require the hosted provider, so synthetic fixtures cannot supply authority to a deployed request.
- `verify:identity-surface` is the entry-point gate. Its limit: it classifies routes statically and does not classify referents (drafts, rosters, publications, activity versions); those ownership checks live in each delivery module and the PT matrix.
- The migration's pre-tenant credential lookup is a `security definer` function. The least-privilege role split that makes it safe belongs to [#100](https://github.com/abodacs/edu-canvas/issues/100); until it lands, the application connects as the table owner and the function is documented in `migrations/0004_identity.sql`.

Severity contract: error rules must stay green in every PR. Warn rules are named boundary debt — each comment states the migration wave that retires it (see the [context migration waves](../ARCHITECTURE.md#target-layout-and-migration-waves)). A new warn outside a planned wave is a review blocker; flipping a warn to error is part of its wave. Context rules apply to production modules; test modules may assemble cross-context fixtures.

The harness is not a substitute for review. When a new global state holder or cross-seam import is genuinely required, give it a named owner, record the reason in the relevant architecture decision, and then update this harness deliberately.
