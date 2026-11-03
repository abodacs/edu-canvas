import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import { selectJsPlugins } from "ultracite/oxlint/js-plugins";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";
import tanstackJsPlugins from "ultracite/oxlint/tanstack/js-plugins";
import vitest from "ultracite/oxlint/vitest";

// The ESLint preset also ran github and sonarjs rules. Only react-doctor
// stays, through oxlint's JS plugin bridge: sonarjs cost 22 s of a 34 s run
// there, and eslint-plugin-github needs ESLint itself at runtime. oxlint's
// native eslint/unicorn/typescript/import rules cover most of what they did.
const jsPlugins = selectJsPlugins(["react-doctor"]);

const reactDoctorOff = Object.fromEntries(
  Object.keys({ ...jsPlugins.rules, ...tanstackJsPlugins.rules })
    .filter((rule) => rule.startsWith("react-doctor/"))
    .map((rule) => [rule, "off" as const])
);

export default defineConfig({
  extends: [core, react, tanstack, vitest, jsPlugins, tanstackJsPlugins],
  jsPlugins: jsPlugins.jsPlugins,
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    // Paths outside the shipped source: nested git worktrees, generated
    // route trees, and build output. They are not ours to lint.
    ".worktrees/**",
    // Harness-managed worktrees: ignored only via .git/info/exclude, which
    // the linter does not read. One nested checkout held 112k files on 2026-11-03.
    ".claude/worktrees/**",
    ".tanstack/**",
    ".output/**",
    ".nitro/**",
    "teaching/**",
    // Local evidence and scratch runs: gitignored one-off diagnostics.
    ".scratch/**",
    // Vendored agent skills: upstream code, reviewed as a dependency.
    ".agents/skills/**",
    ".claude/skills/**",
    // Tool-owned config, not shipped source; its rules live in the file itself.
    ".dependency-cruiser.cjs",
    "src/routeTree.gen.ts",
  ],
  rules: {
    // arrow-body-style and unicorn/consistent-arrow-return-style contradict
    // each other on arrows whose single return expression spans lines. Defer
    // to the unicorn rule, which allows the block form for multiline
    // expressions and still requires concise bodies for single-line ones.
    "arrow-body-style": "off",
    // `pnpm verify:boundaries` (dependency-cruiser `no-circular`) already
    // rejects import cycles across src/; the lint copy only duplicated it.
    "import/no-cycle": "off",
    // oxlint's port of the React Compiler checks flags every react-hooks
    // suppression and every trigger-only effect dependency (for example a
    // focus key); the ESLint rules accepted both, so keep them off until the
    // call sites are reviewed one by one.
    "react/rule-suppression": "off",
    "react/exhaustive-effect-dependencies": "off",
    // Match the options the ESLint preset ran with.
    "unicorn/no-useless-undefined": ["error", { checkArguments: false }],
    "unicorn/prefer-number-properties": [
      "error",
      { checkInfinity: false, checkNaN: false },
    ],
  },
  overrides: [
    {
      // The ESLint preset scoped React rules to JSX files; oxlint's preset
      // applies them everywhere. Keep the old scope so server modules are not
      // linted as components.
      files: ["**/*.ts", "**/*.mts", "**/*.js", "**/*.mjs"],
      rules: {
        ...reactDoctorOff,
        "react/refs": "off",
        "react/set-state-in-effect": "off",
      },
    },
    {
      // TanStack route files define the page component beside `Route` and
      // export only `Route`; Fast Refresh of route modules is the router
      // plugin's job, not this rule's.
      files: ["src/routes/**/*.tsx"],
      rules: { "react-doctor/only-export-components": "off" },
    },
    {
      // Local assertion helpers wrap `expect` so a test reads as one
      // behaviour. Tell vitest/expect-expect to recognise them instead of
      // flagging the test body as assertion-free.
      files: ["**/*.test.ts", "**/*.test.tsx"],
      plugins: ["vitest"],
      rules: {
        "vitest/expect-expect": [
          "error",
          {
            assertFunctionNames: [
              "expect",
              "expectCode",
              "expectPrivateOutputScrubbed",
            ],
          },
        ],
      },
    },
  ],
});
