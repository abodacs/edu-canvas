import { globSync, readFileSync } from "node:fs";

import { defineConfig } from "vitest/config";

const testFiles = ["src/**/*.test.ts"];

// Files that replace a module with `vi.mock` need a fresh module graph, so they
// keep vitest's per-file isolation. Every other file shares one worker's
// module cache, which skips re-importing the app for each file (16 s to 5 s on
// 2026-11-03). Found by content so a new `vi.mock` file isolates itself.
const isolatedFiles = testFiles
  .flatMap((pattern) => globSync(pattern))
  .filter((file) => readFileSync(file, "utf-8").includes("vi.mock("));

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    reporters: ["default"],
    // Shared workers leak state between files unless each file cleans up.
    // This hook undoes env stubs, global stubs, spies, and fake timers after
    // every file; anything else a test changes (module-level caches, servers,
    // database rows) the test must restore itself.
    setupFiles: ["./src/test-setup.ts"],
    // `include` lives on each project: `extends: true` concatenates arrays, so a
    // root `include` would make the isolated project run every file too.
    projects: [
      {
        extends: true,
        test: {
          name: "shared",
          include: testFiles,
          exclude: isolatedFiles,
          isolate: false,
          // Concatenated onto the root setup files. Shared files must clear
          // the module-scoped identity rate limiter between files; isolated
          // files rebuild their module graph anyway and must not load this
          // server import.
          setupFiles: ["./src/test-shared-setup.ts"],
        },
      },
      {
        extends: true,
        test: { name: "isolated", include: isolatedFiles },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/routeTree.gen.ts"],
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      thresholds: {
        // Ratcheted to the gated baseline measured on 2026-07-16 (ticket #13):
        // Stmts 50.68 / Branches 65.15 / Functions 46.34 / Lines 50.7 over src/**/*.ts.
        // The floor is the integer below the measured value so the baseline passes
        // and any regression fails. Raise toward 80% as walking-skeleton slices
        // (#3-#11) land with tests.
        lines: 50,
        branches: 65,
        functions: 46,
        statements: 50,
      },
    },
  },
});

export default config;
