# Agent instructions

Before changing or reviewing code, read [code standards](CODING_STANDARDS.md). Follow its linked [coding patterns](docs/engineering/coding-patterns.md) when working on domain rules, integrations, state transitions, errors, or PR scope.

When changing imports, shared contracts, or server delivery seams, read the [architecture harness](docs/architecture-harness.md) and preserve its boundaries.

For issue reports, commit messages, and verification, follow [CONTRIBUTING.md](CONTRIBUTING.md) and the commands in [package.json](package.json).

## Enforced rules

These are checks, not conventions. [Foundation CI](.github/workflows/foundation.yml) runs `pnpm check`, which runs every one of them.

| Rule | Enforced by | Fails when |
| --- | --- | --- |
| The demo-mode runtime is gone; use `syntheticSeed`, not the removed demo names | `pnpm verify:demo-removal` | a removed identifier (`DEMO_MODE`, `demoSeed`, `demoMode`, `seededDemoMode`, `readDemoCounts`, and the rest) appears outside `docs/archive/` and dated evidence records |
| Runtime composition uses PostgreSQL; in-memory stores are test doubles | `runtime-imports-in-memory-store` in `pnpm verify:boundaries` | a non-test `src/` module imports `persistence/seeded.ts` or any `persistence/*-seeded.ts`; name every new double with the `-seeded.ts` suffix |
| No server-only value reaches the browser bundle | `pnpm verify:client-boundary` | a key or secret marker appears in `.output/public` |
| Every private API route resolves a session | `pnpm verify:identity-surface` | a route under `src/routes/api` is neither public-listed nor reaches a delivery module that resolves the caller |
| The architecture map names every context and no decision ID repeats | `pnpm verify:architecture-map` | a `src/server/*/` directory has no ownership row in `ARCHITECTURE.md`, two `docs/agdr/` files share an `AgDR-NNNN`, or a cited decision file is missing |
| Every table and stored-record schema has one owning term | `pnpm verify:glossary-coverage` | a table in `drizzle/schema.ts` or a record schema in `src/server/records/` is claimed by no `GLOSSARY.md` entry, claimed twice, or a claimed name does not exist |
| Shared modules stay browser-safe; layers stay acyclic | `pnpm verify:architecture` and `pnpm verify:boundaries` | a layer rule or import cycle is violated |

Add a rule here only together with the check that enforces it. A rule without a check is a review note, not a rule. When a correction repeats, fix it at the highest level that works and add the enforcing check in the same change.
