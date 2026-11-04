import { describe, expect, it } from "vitest";

import {
  clampCeiling,
  hasLiteralDuration,
  joinDurationDeclarations,
  literalDurationCount,
} from "./design-token-ratchet.ts";

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

describe("literal durations in shorthands", () => {
  it("counts the duration, not the delay", () => {
    expect(
      hasLiteralDuration(
        "animation",
        "reveal var(--duration-base) var(--ease-enter) 120ms forwards"
      )
    ).toBeFalsy();
    expect(
      hasLiteralDuration(
        "transition",
        "opacity var(--duration-fast) var(--ease-enter) 30ms"
      )
    ).toBeFalsy();
    expect(
      hasLiteralDuration("animation", "reveal 400ms var(--ease-out) 120ms")
    ).toBeTruthy();
  });

  it("counts every layer of a multi-layer value", () => {
    expect(
      literalDurationCount(
        "transition",
        "border-color 150ms ease, opacity var(--duration-fast), transform 150ms ease"
      )
    ).toBe(2);
    expect(
      hasLiteralDuration(
        "transition",
        "opacity var(--duration-fast) cubic-bezier(0.2, 0, 0, 1), transform 150ms ease"
      )
    ).toBeTruthy();
  });

  it("joins a value that spans lines before it is classified", () => {
    const lines = joinDurationDeclarations([
      ".card {",
      "transition:",
      "border-color 150ms var(--ease-out),",
      "transform 150ms var(--ease-out);",
      "}",
    ]);
    expect(lines).toStrictEqual([
      ".card {",
      "transition: border-color 150ms var(--ease-out), transform 150ms var(--ease-out);",
      "}",
    ]);
    const [, declaration = ""] = lines;
    expect(
      hasLiteralDuration("transition", declaration.slice("transition:".length))
    ).toBeTruthy();
  });

  it("leaves selectors and one-line declarations alone", () => {
    const lines = ["a:hover,", "a:focus {", "transition: none;", "}"];
    expect(joinDurationDeclarations(lines)).toStrictEqual(lines);
  });
});
