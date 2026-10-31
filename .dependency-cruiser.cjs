/**
 * Boundary rules for the module structure documented in ARCHITECTURE.md
 * ("Bounded contexts and context map") and the rationale in
 * docs/agdr/AgDR-0008-bounded-contexts-and-screaming-layout.md.
 *
 * Layer rules mirror scripts/verify-architecture.ts. This file adds what the
 * regex scanner cannot see: dependency cycles, per-context decoupling rules,
 * and database-client ownership.
 *
 * Severity contract: "error" rules must stay green in every PR. "warn" rules
 * name a known boundary debt; each one lists the migration wave that retires
 * it in ARCHITECTURE.md ("Context migration plan"). A warn may not be newly
 * violated — flip it to error when its wave lands.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment:
        "Dependency cycles hide who owns a decision. Break the cycle with a port or a shared contract module. src/routeTree.gen.ts is not traversed: the router plugin generates its edge to src/router.tsx.",
      severity: "error",
      from: {},
      to: { circular: true, pathNot: "^src/routeTree\\.gen\\.tsx?$" },
    },
    {
      name: "shared-stays-browser-safe",
      comment:
        "src/shared is the published language for browser and server; it may not depend on runtime code.",
      severity: "error",
      from: { path: "^src/shared" },
      to: {
        path: [
          "^src/server",
          "^src/routes",
          "^src/components",
          "^node:",
          "^postgres",
        ],
      },
    },
    {
      name: "ui-cannot-reach-runtime",
      comment:
        "Components render; they never import server or route modules directly.",
      severity: "error",
      from: { path: "^src/components" },
      to: { path: ["^src/server", "^src/routes"] },
    },
    {
      name: "server-cannot-reach-delivery",
      comment:
        "Domain behavior must stay callable without HTTP routes or React trees.",
      severity: "error",
      from: { path: "^src/server" },
      to: { path: ["^src/routes", "^src/components"] },
    },
    {
      name: "routes-cross-named-seams-only",
      comment:
        "Route modules reach server behavior only through .server or server-function modules.",
      severity: "error",
      from: { path: "^src/routes" },
      to: {
        path: "^src/server",
        pathNot: "(^|/)([^/]+\\.server|server-function)\\.tsx?$",
      },
    },
    {
      name: "persistence-owns-database-clients",
      comment:
        "Only the persistence platform may import postgres; domain modules go through persistence ports.",
      severity: "error",
      from: { path: "^src", pathNot: "^src/server/persistence" },
      to: { path: "^postgres" },
    },
    {
      name: "drafting-and-preview-stay-decoupled",
      comment:
        "Lesson drafting must not know about A2UI preview compilation, and vice versa. The persistence record is their only meeting point.",
      severity: "error",
      from: { path: "^src/server/generation" },
      to: { path: "^src/server/a2ui" },
    },
    {
      name: "preview-and-drafting-stay-decoupled",
      comment:
        "Preview compilation may consume the generation record types (the persistence record is the meeting point) but no generation logic. Test modules may assemble cross-context fixtures.",
      severity: "error",
      from: { path: "^src/server/a2ui", pathNot: "\\.test\\.tsx?$" },
      to: {
        path: "^src/server/generation",
        pathNot: "^src/server/generation/types\\.tsx?$",
      },
    },
    {
      name: "no-global-state-packages",
      comment:
        "Global mutable state needs an explicit owner and a decision record (see the architecture harness).",
      severity: "error",
      from: {},
      to: { path: "^(jotai|mobx|redux|valtio|zustand|@reduxjs/toolkit)" },
    },
    {
      name: "runtime-imports-in-memory-store",
      comment:
        "In-memory persistence is a test double. Runtime modules must compose PostgreSQL.",
      severity: "error",
      from: {
        path: "^src/",
        pathNot: [
          "\\.test\\.tsx?$",
          "^src/server/persistence/(seeded|source-seeded|identity-seeded)\\.ts$",
        ],
      },
      to: {
        path: "^src/server/persistence/(seeded|source-seeded|identity-seeded)\\.ts$",
      },
    },
    {
      name: "drafting-imports-seed-curriculum-directly",
      comment:
        "BACKLOG (wave 2, curriculum context): generation reads the seeded curriculum module directly. Move seed data into a curriculum context behind a versioned context port (AgDR-0005 direction).",
      severity: "warn",
      from: { path: "^src/server/generation", pathNot: "\\.test\\.tsx?$" },
      to: { path: "^src/server/seed-data" },
    },
  ],
  options: {
    doNotFollow: { path: "^(node_modules|src/routeTree\\.gen\\.tsx?$)" },
    moduleSystems: ["es6", "cjs"],
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
