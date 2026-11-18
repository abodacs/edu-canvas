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

// Type-aware activation (the `options` block below) switched on 56
// previously-inert preset rules; these 27 fire 2040 times on the existing
// tree. Hold them at warn until the backlog is triaged so the gate stays
// green while the findings stay visible, and let the lint script's
// --max-warnings pin the count so it can only fall. Known noise while the
// backlog exists: typescript/no-deprecated flags the @deprecated
// declarations themselves instead of uses (a port difference from
// typescript-eslint), and typescript/switch-exhaustiveness-check reports
// switches that already end in a safe default.
const typeAwareWarnRules = [
  "typescript/await-thenable",
  "typescript/dot-notation",
  "typescript/no-base-to-string",
  "typescript/no-confusing-void-expression",
  "typescript/no-deprecated",
  "typescript/no-floating-promises",
  "typescript/no-misused-promises",
  "typescript/no-misused-spread",
  "typescript/non-nullable-type-assertion-style",
  "typescript/no-unnecessary-type-assertion",
  "typescript/no-unnecessary-type-conversion",
  "typescript/no-unnecessary-type-parameters",
  "typescript/no-unsafe-argument",
  "typescript/no-unsafe-assignment",
  "typescript/no-unsafe-call",
  "typescript/no-unsafe-member-access",
  "typescript/no-unsafe-return",
  "typescript/no-unsafe-type-assertion",
  "typescript/prefer-nullish-coalescing",
  "typescript/prefer-regexp-exec",
  "typescript/prefer-string-starts-ends-with",
  "typescript/promise-function-async",
  "typescript/restrict-template-expressions",
  "typescript/return-await",
  "typescript/strict-boolean-expressions",
  "typescript/strict-void-return",
  "typescript/switch-exhaustiveness-check",
];

const typeAwareWarn = Object.fromEntries(
  typeAwareWarnRules.map((rule) => [rule, "warn" as const])
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
  // Route type-aware linting through tsrs (oxlint 1.94 + tsrs 0.25): a full
  // run costs ~0.3 s and ~90 MB more than the plain pass. Equivalent to
  // passing --type-aware on the CLI; see the warn block in `rules` for how
  // the first run's 2040 findings are held.
  options: { typeAware: true },
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
    ...typeAwareWarn,
    // A bare severity resets the preset's option; keep its "always".
    "typescript/return-await": ["warn", "always"],
  },
  overrides: [
    {
      // The no-unsafe-* family needs type information to be meaningful. The
      // repository's deliberately untyped .mjs scripts (browser automation,
      // the migration runtime, commit hygiene, tooling config) would flag on
      // every access, so they stay out of scope until those scripts gain
      // types.
      files: ["**/*.mjs"],
      rules: {
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-unsafe-type-assertion": "off",
      },
    },
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
