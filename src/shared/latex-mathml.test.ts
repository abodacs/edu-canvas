import { describe, expect, it } from "vitest";

import { isAllowedLatexInput, parseLatexToMathML } from "./latex-mathml";

describe("bounded LaTeX subset to MathML tree", () => {
  it("parses equivalent-fraction notation into a fraction tree", () => {
    const parsed = parseLatexToMathML("\\frac{1}{2} + \\frac{3}{4} = 1");

    expect(parsed).toMatchObject({ ok: true });

    if (!parsed.ok) {
      return;
    }
    const { root } = parsed;
    if (root.kind !== "row") {
      throw new Error("Expected a row root for the fraction sequence.");
    }

    expect(root).toMatchObject({
      kind: "row",
      children: [
        {
          kind: "frac",
          numerator: [{ kind: "number", value: "1" }],
          denominator: [{ kind: "number", value: "2" }],
        },
        { kind: "operator", value: "+" },
        {
          kind: "frac",
          numerator: [{ kind: "number", value: "3" }],
          denominator: [{ kind: "number", value: "4" }],
        },
        { kind: "operator", value: "=" },
        { kind: "number", value: "1" },
      ],
    });
  });

  it("parses nested fractions, variables, and translated operators", () => {
    const parsed = parseLatexToMathML("\\frac{\\frac{1}{2}}{4} x \\times y");

    expect(parsed).toMatchObject({ ok: true });

    if (!parsed.ok) {
      return;
    }
    const { root } = parsed;
    if (root.kind !== "row") {
      throw new Error("Expected a row root for the nested sequence.");
    }
    const [nested, x, times, y] = root.children;

    expect(nested).toMatchObject({
      kind: "frac",
      numerator: [
        {
          kind: "frac",
          numerator: [{ kind: "number", value: "1" }],
          denominator: [{ kind: "number", value: "2" }],
        },
      ],
      denominator: [{ kind: "number", value: "4" }],
    });
    expect(x).toMatchObject({ kind: "identifier", value: "x" });
    expect(times).toMatchObject({ kind: "operator", value: "×" });
    expect(y).toMatchObject({ kind: "identifier", value: "y" });
  });

  it("parses decimals, comparisons, and grouped braces", () => {
    const parsed = parseLatexToMathML("0.5 \\le \\frac{1}{2}, (a)");

    expect(parsed).toMatchObject({ ok: true });

    if (!parsed.ok) {
      return;
    }
    const { root } = parsed;
    if (root.kind !== "row") {
      throw new Error("Expected a row root for the mixed sequence.");
    }
    const [decimal, lessOrEqual, fraction, comma, open, a, close] =
      root.children;

    expect(decimal).toMatchObject({ kind: "number", value: "0.5" });
    expect(lessOrEqual).toMatchObject({ kind: "operator", value: "≤" });
    expect(fraction).toMatchObject({ kind: "frac" });
    expect(comma).toMatchObject({ kind: "operator", value: "," });
    expect(open).toMatchObject({ kind: "operator", value: "(" });
    expect(a).toMatchObject({ kind: "identifier", value: "a" });
    expect(close).toMatchObject({ kind: "operator", value: ")" });
  });

  it("fails closed on unsupported commands, characters, and structure", () => {
    expect(parseLatexToMathML("\\input{document}")).toMatchObject({
      ok: false,
      code: "INVALID_MATH",
    });
    expect(parseLatexToMathML("\\frac{1}")).toMatchObject({
      ok: false,
      code: "INVALID_MATH",
    });
    expect(parseLatexToMathML("50\\% + 1")).toMatchObject({
      ok: false,
      code: "INVALID_MATH",
    });
    expect(parseLatexToMathML("1 + 1}")).toMatchObject({
      ok: false,
      code: "INVALID_MATH",
    });
    expect(parseLatexToMathML("\\frac{1}}{2}")).toMatchObject({
      ok: false,
      code: "INVALID_MATH",
    });
    expect(parseLatexToMathML("")).toMatchObject({
      ok: false,
      code: "INVALID_MATH",
    });
  });

  it("rejects brace nesting past the bounded depth", () => {
    const depth = 20;
    const deep = `${"{".repeat(depth)}1${"}".repeat(depth)}`;

    expect(parseLatexToMathML(deep)).toMatchObject({
      ok: false,
      code: "INVALID_MATH",
    });
  });

  it("allowlists exactly the trusted characters and commands", () => {
    expect(isAllowedLatexInput("\\frac{1}{2} + x \\le 1")).toBeTruthy();
    expect(isAllowedLatexInput("\\times \\div \\cdot \\ge \\neq")).toBeTruthy();
    expect(isAllowedLatexInput("\\input{document}")).toBeFalsy();
    expect(isAllowedLatexInput("\\def\\x{1}\\x")).toBeFalsy();
    expect(isAllowedLatexInput("50\\%")).toBeFalsy();
    expect(isAllowedLatexInput("a;b")).toBeFalsy();
  });
});
