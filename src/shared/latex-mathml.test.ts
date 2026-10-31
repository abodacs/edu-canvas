import { describe, expect, it } from "vitest";

import { isAllowedLatexInput, parseLatexToMathML } from "./latex-mathml";

describe(parseLatexToMathML, () => {
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
    const [firstFraction, plus, secondFraction] = root.children;

    expect(firstFraction).toMatchObject({
      kind: "frac",
      numerator: [{ kind: "number", value: "1" }],
      denominator: [{ kind: "number", value: "2" }],
    });
    expect(plus).toMatchObject({ kind: "operator", value: "+" });
    expect(secondFraction).toMatchObject({
      kind: "frac",
      numerator: [{ kind: "number", value: "3" }],
      denominator: [{ kind: "number", value: "4" }],
    });
  });

  it("parses nested fractions and variables", () => {
    const parsed = parseLatexToMathML("\\frac{\\frac{1}{2}}{4} x");

    expect(parsed).toMatchObject({ ok: true });

    if (!parsed.ok) {
      return;
    }
    const { root } = parsed;
    if (root.kind !== "row") {
      throw new Error("Expected a row root for the nested sequence.");
    }
    const [nested, variable] = root.children;

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
    expect(variable).toMatchObject({ kind: "identifier", value: "x" });
  });

  it("translates operator commands to their unicode operators", () => {
    const parsed = parseLatexToMathML("x \\times y \\div z");

    expect(parsed).toMatchObject({ ok: true });

    if (!parsed.ok) {
      return;
    }
    const { root } = parsed;
    if (root.kind !== "row") {
      throw new Error("Expected a row root for the operator sequence.");
    }
    const [, times, , div] = root.children;

    expect(times).toMatchObject({ kind: "operator", value: "×" });
    expect(div).toMatchObject({ kind: "operator", value: "÷" });
  });

  it("parses decimals, comparisons, and punctuation", () => {
    const parsed = parseLatexToMathML("0.5 \\le \\frac{1}{2},");

    expect(parsed).toMatchObject({ ok: true });

    if (!parsed.ok) {
      return;
    }
    const { root } = parsed;
    if (root.kind !== "row") {
      throw new Error("Expected a row root for the mixed sequence.");
    }
    const [decimal, lessOrEqual, fraction, comma] = root.children;

    expect(decimal).toMatchObject({ kind: "number", value: "0.5" });
    expect(lessOrEqual).toMatchObject({ kind: "operator", value: "≤" });
    expect(fraction).toMatchObject({ kind: "frac" });
    expect(comma).toMatchObject({ kind: "operator", value: "," });
  });

  it("renders parentheses as flat operator nodes around variables", () => {
    const parsed = parseLatexToMathML("(a)");

    expect(parsed).toMatchObject({ ok: true });

    if (!parsed.ok) {
      return;
    }
    const { root } = parsed;
    if (root.kind !== "row") {
      throw new Error("Expected a row root for the grouped sequence.");
    }
    const [open, variable, close] = root.children;

    expect(open).toMatchObject({ kind: "operator", value: "(" });
    expect(variable).toMatchObject({ kind: "identifier", value: "a" });
    expect(close).toMatchObject({ kind: "operator", value: ")" });
  });

  it("fails closed on unsupported commands and characters", () => {
    expect(parseLatexToMathML("\\input{document}")).toMatchObject({
      ok: false,
      code: "INVALID_MATH",
    });

    expect(parseLatexToMathML("50\\% + 1")).toMatchObject({
      ok: false,
      code: "INVALID_MATH",
    });
  });

  it("fails closed on unbalanced structure and empty input", () => {
    expect(parseLatexToMathML("\\frac{1}")).toMatchObject({
      ok: false,
      code: "INVALID_MATH",
    });

    expect(parseLatexToMathML("1 + 1}")).toMatchObject({
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
});

describe(isAllowedLatexInput, () => {
  it("allowlists exactly the trusted commands", () => {
    expect(isAllowedLatexInput("\\frac{1}{2} + x \\le 1")).toBeTruthy();
    expect(isAllowedLatexInput("\\times \\div \\cdot \\ge \\neq")).toBeTruthy();
    expect(isAllowedLatexInput("\\input{document}")).toBeFalsy();
    expect(isAllowedLatexInput("\\def\\x{1}\\x")).toBeFalsy();
  });

  it("allowlists exactly the trusted characters", () => {
    expect(isAllowedLatexInput("x + 1")).toBeTruthy();
    expect(isAllowedLatexInput("50\\%")).toBeFalsy();
    expect(isAllowedLatexInput("a;b")).toBeFalsy();
  });
});
