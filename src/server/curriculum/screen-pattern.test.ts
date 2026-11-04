import { describe, expect, it } from "vitest";

import { resolveScreenPattern } from "./screen-pattern";

describe("allowed screen patterns", () => {
  it("allows a pattern the pack lists", () => {
    expect(resolveScreenPattern(["matching"], "matching")).toStrictEqual({
      status: "allowed",
      pattern: "matching",
    });
  });

  it("refuses a pattern the pack does not list with a visible diagnostic", () => {
    const decision = resolveScreenPattern(["matching"], "free-text");

    expect(decision).toMatchObject({
      status: "refused",
      refusal: { code: "UNSUPPORTED_SCREEN_PATTERN" },
    });
    if (decision.status !== "refused") {
      throw new Error("Expected the screen pattern to be refused.");
    }

    expect(decision.refusal.message).toContain("matching");
    expect(decision.refusal.message).toContain("free-text");
    expect(decision.refusal.allowed).toStrictEqual(["matching"]);
  });
});
