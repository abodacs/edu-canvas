import { describe, expect, it } from "vitest";

import { clampCeiling, hasLiteralDuration } from "./design-token-ratchet.ts";

const RULES = ["raw-color", "literal-radius"] as const;

describe(clampCeiling, () => {
  it("lowers a ceiling when the count fell", () => {
    const result = clampCeiling(
      RULES,
      { "raw-color": { "a.css": 5 }, "literal-radius": { "a.css": 2 } },
      { "raw-color": { "a.css": 3 }, "literal-radius": { "a.css": 2 } }
    );
    expect(result.rules["raw-color"]).toStrictEqual({ "a.css": 3 });
    expect(result.refused).toStrictEqual([]);
  });

  it("keeps the old ceiling and reports the rule when the count grew", () => {
    const result = clampCeiling(
      RULES,
      { "raw-color": { "a.css": 5 }, "literal-radius": {} },
      { "raw-color": { "a.css": 6 }, "literal-radius": {} }
    );
    expect(result.rules["raw-color"]).toStrictEqual({ "a.css": 5 });
    expect(result.refused).toStrictEqual(["raw-color: 5 -> 6"]);
  });

  it("accepts a re-keyed split when the total is unchanged", () => {
    const result = clampCeiling(
      RULES,
      { "raw-color": { "styles.css": 4 }, "literal-radius": {} },
      {
        "raw-color": { "styles/base.css": 1, "styles/studio.css": 3 },
        "literal-radius": {},
      }
    );
    expect(result.rules["raw-color"]).toStrictEqual({
      "styles/base.css": 1,
      "styles/studio.css": 3,
    });
    expect(result.refused).toStrictEqual([]);
  });

  it("writes current counts when there is no previous baseline", () => {
    const result = clampCeiling(RULES, undefined, {
      "raw-color": { "a.css": 9 },
    });
    expect(result.rules).toStrictEqual({
      "raw-color": { "a.css": 9 },
      "literal-radius": {},
    });
  });
});

describe(hasLiteralDuration, () => {
  it("flags a literal time in a transition or animation", () => {
    expect(
      hasLiteralDuration("transition", "border-color 150ms ease")
    ).toBeTruthy();
    expect(
      hasLiteralDuration("animation", "pulse 1.4s ease-in-out")
    ).toBeTruthy();
    expect(hasLiteralDuration("transition-duration", ".2s")).toBeTruthy();
  });

  it("accepts durations that come from tokens", () => {
    expect(
      hasLiteralDuration(
        "transition",
        "opacity var(--duration-fast) var(--ease-enter)"
      )
    ).toBeFalsy();
    expect(
      hasLiteralDuration("animation-duration", "var(--duration-base)")
    ).toBeFalsy();
  });

  it("ignores delays and unrelated properties", () => {
    expect(hasLiteralDuration("animation-delay", "30ms")).toBeFalsy();
    expect(hasLiteralDuration("transition-property", "opacity")).toBeFalsy();
    expect(hasLiteralDuration("inline-size", "12ms")).toBeFalsy();
  });
});
