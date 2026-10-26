import core from "ultracite/eslint/core";
import react from "ultracite/eslint/react";
import tanstack from "ultracite/eslint/tanstack";
import vitest from "ultracite/eslint/vitest";

export default [
  ...core,
  ...react,
  ...tanstack,
  ...vitest,
  {
    // arrow-body-style and unicorn/consistent-arrow-return-style contradict
    // each other on arrows whose single return expression spans lines: the
    // first demands a concise body, the second a block with `return`. Defer
    // to the unicorn rule, which allows the block form for multiline
    // expressions and still requires concise bodies for single-line ones.
    rules: {
      "arrow-body-style": "off",
    },
  },
  {
    // React requires component identifiers to start with an uppercase letter,
    // while sonarjs/function-name's default pattern requires a lowercase
    // start. Allow PascalCase names in the UI component files only.
    files: ["src/components/**/*.tsx"],
    rules: {
      "sonarjs/function-name": ["error", { format: "^[a-zA-Z][a-zA-Z0-9]*$" }],
    },
  },
  {
    // Paths outside the shipped source: nested git worktrees, generated
    // route trees, and build output. They are not ours to lint.
    ignores: [
      ".worktrees/**",
      ".tanstack/**",
      ".output/**",
      ".nitro/**",
      "migrations/**",
      "teaching/**",
      // Tool-owned config, not shipped source; its rules live in the file itself.
      ".dependency-cruiser.cjs",
    ],
  },
];
