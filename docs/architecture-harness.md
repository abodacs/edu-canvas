# Architecture harness

`pnpm verify:architecture` protects the current structure as a communication contract. It is intentionally small and specific to the repository’s current seams.

## Guardrails

- **State ownership:** common global-store imports, store constructors, and unowned `store.ts`/`global-state.ts`/`app-state.ts` modules fail the check. Local UI state remains allowed.
- **Layer ownership:** shared modules cannot import server, route, UI, Node, or PostgreSQL code; UI modules cannot import runtime behavior; server modules cannot import delivery or UI modules.
- **Named delivery seams:** route modules may import only `.server` modules or `/server-function` modules from the server tree.
- **Contract ownership:** the public demo snapshot is parsed by `demoSnapshotSchema` and checked for answer-key leakage at the server seam.

The harness is not a substitute for review. When a new global state holder or cross-seam import is genuinely required, give it a named owner, record the reason in the relevant architecture decision, and then update this harness deliberately.
