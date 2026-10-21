import config from "ultracite/stylelint";

export default {
  ...config,
  // `teaching/` holds hand-authored curriculum assets, not shipped
  // application styles. ESLint already excludes it for the same reason.
  ignoreFiles: ["teaching/**", "coverage/**"],
  rules: {
    ...config.rules,
    // The app's stylesheets use BEM (`reveal__head`, `page-grid--hero`).
    // Keep the naming rule on, but match the convention this codebase
    // already ships instead of the default kebab-only pattern.
    "selector-class-pattern":
      "^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$",
  },
};
