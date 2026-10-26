# Architecture harness

`pnpm verify:architecture` protects the current structure as a communication contract. It is intentionally small and specific to the repository’s current seams. `pnpm verify:boundaries` ([dependency-cruiser](../../../.dependency-cruiser.cjs)) complements it with whole-graph checks the regex scan cannot make.

## Guardrails

- **State ownership:** common global-store imports, store constructors, and unowned `store.ts`/`global-state.ts`/`app-state.ts` modules fail the check. Local UI state remains allowed.
- **Layer ownership:** shared modules cannot import server, route, UI, Node, or PostgreSQL code; UI modules cannot import runtime behavior; server modules cannot import delivery or UI modules.
- **Named delivery seams:** route modules may import only `.server` modules or `/server-function` modules from the server tree.
- **Contract ownership:** the public demo snapshot is parsed by `demoSnapshotSchema` and checked for answer-key leakage at the server seam.

## Dependency boundaries (verify:boundaries)

The two scanners split the work: `verify:architecture` owns the layer and state conventions above; `verify:boundaries` cruises the full `src/` import graph and owns what needs graph knowledge.

- **No dependency cycles** (excluding the generated `routeTree.gen.ts`, whose edge to `router.tsx` the router plugin owns).
- **Context decoupling:** `src/server/generation` and `src/server/a2ui` may not import each other’s logic; the persistence record (and its types) is their meeting point.
- **Database-client ownership:** only `src/server/persistence` imports `postgres`.
- **Layer rules mirrored** from `verify:architecture`, so a bypass via a resolved path cannot slip past one scanner.

Severity contract: error rules must stay green in every PR. Warn rules are named boundary debt — each comment states the migration wave that retires it (see the [context migration waves](../ARCHITECTURE.md#target-layout-and-migration-waves)). A new warn outside a planned wave is a review blocker; flipping a warn to error is part of its wave. Context rules apply to production modules; test modules may assemble cross-context fixtures.

The harness is not a substitute for review. When a new global state holder or cross-seam import is genuinely required, give it a named owner, record the reason in the relevant architecture decision, and then update this harness deliberately.
