import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/routeTree.gen.ts'],
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
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
})
