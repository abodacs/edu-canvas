import { describe, expect, it } from "vitest";

import {
  evaluateAnswerRule,
  evaluateAnswerRules,
  normalizeAnswerText,
  parseWholeNumberEquation,
} from "./answer-rules";

import type { AnswerRule } from "./standards-pack";

const fractionRule: AnswerRule = {
  kind: "fraction-equivalence",
  unverifiedVerdict: "warning",
};

const wholeNumberRule: AnswerRule = {
  kind: "whole-number-expression",
  problems: [
    {
      text: "Sam has 4 boxes with 6 pencils in each box. He gives away 5 pencils. How many pencils are left?",
      answer: 19,
    },
  ],
  unverifiedVerdict: "warning",
};

const remainderRule: AnswerRule = {
  kind: "whole-number-expression",
  problems: [
    {
      text: "A class of 27 students sits at tables of 4. How many tables are needed so everyone has a seat?",
      answer: 7,
      rounding: "up",
    },
  ],
  unverifiedVerdict: "warning",
};

const evidenceRule: AnswerRule = {
  kind: "text-evidence",
  passage:
    "Bees carry pollen from one flower to the next. Farmers rent hives so their orchards produce more fruit.",
  unverifiedVerdict: "hard_block",
};

const teacherReviewRule: AnswerRule = {
  kind: "teacher-review",
  unverifiedVerdict: "warning",
};

describe("answer text normalization", () => {
  it("folds case, whitespace, and punctuation", () => {
    expect(
      normalizeAnswerText("  Bees   CARRY pollen, from one flower!  ")
    ).toBe("bees carry pollen from one flower");
  });
});

describe("whole-number equation parsing", () => {
  it.each([
    ["4 × 6 − 5 = p", 19],
    ["4 * 6 - 5 = p", 19],
    ["(2 + 3) × 4 = a", 20],
    ["27 ÷ 3 = t", 9],
    ["8 / 2 = q", 4],
    ["6 - 2 = a", 4],
    ["3 = x", 3],
    // A blank box or a question mark is how a teacher writes an unknown.
    ["4 × 6 − 5 = □", 19],
    ["4 × 6 − 5 = ?", 19],
  ])("evaluates %s to %i", (target, expected) => {
    expect(parseWholeNumberEquation(target)).toStrictEqual({
      status: "evaluated",
      value: expected,
    });
  });

  it.each([
    "27 ÷ 4 = t, round up",
    "2 + = a",
    "2 = 3 = a",
    "5 ÷ 0 = a",
    "2.5 + 1 = a",
    "4 × 6 − 5 = p q",
    // Words, remainder text and rounding marks are not an unknown symbol.
    "27 ÷ 4 = 6 R3 → 7 tables needed",
    "⌈27 ÷ 4⌉ = 7",
  ])("rejects the malformed target %s", (target) => {
    expect(parseWholeNumberEquation(target)).toStrictEqual({
      status: "invalid",
    });
  });

  it("reports a non-integer division instead of a crash", () => {
    expect(parseWholeNumberEquation("7 ÷ 2 = x")).toStrictEqual({
      status: "non-integer",
    });
  });
});

describe("fraction-equivalence", () => {
  it("verifies equivalent names", () => {
    expect(
      evaluateAnswerRule(fractionRule, { source: "1/2", target: "2/4" })
    ).toStrictEqual({ status: "verified" });
  });

  it("hard-blocks a mismatched pair", () => {
    expect(
      evaluateAnswerRule(fractionRule, { source: "1/2", target: "2/3" })
    ).toMatchObject({ status: "mismatch" });
  });

  it("applies the rule's unverified verdict to a label it cannot read", () => {
    expect(
      evaluateAnswerRule(
        { ...fractionRule, unverifiedVerdict: "hard_block" },
        { source: "one half", target: "2/4" }
      )
    ).toMatchObject({ status: "unverified", verdict: "hard_block" });
  });
});

describe("whole-number-expression", () => {
  it("verifies the declared answer", () => {
    expect(
      evaluateAnswerRule(wholeNumberRule, {
        source: wholeNumberRule.problems[0]?.text ?? "",
        target: "4 × 6 − 5 = p",
      })
    ).toStrictEqual({ status: "verified" });
  });

  it("matches a declared problem by normalized text", () => {
    expect(
      evaluateAnswerRule(wholeNumberRule, {
        source:
          "  sam has 4 boxes, with 6 pencils in each box! he gives away 5 pencils. how many pencils are left ",
        target: "4 × 6 − 5 = p",
      })
    ).toStrictEqual({ status: "verified" });
  });

  it("hard-blocks an equation whose result contradicts the declared answer", () => {
    expect(
      evaluateAnswerRule(wholeNumberRule, {
        source: wholeNumberRule.problems[0]?.text ?? "",
        target: "4 + 6 − 5 = p",
      })
    ).toMatchObject({ status: "mismatch" });
  });

  it("hard-blocks a non-integer division for a whole-number answer", () => {
    expect(
      evaluateAnswerRule(
        {
          kind: "whole-number-expression",
          problems: [{ text: "Split 7 into 2 equal parts.", answer: 3 }],
          unverifiedVerdict: "warning",
        },
        { source: "Split 7 into 2 equal parts.", target: "7 ÷ 2 = x" }
      )
    ).toMatchObject({ status: "mismatch" });
  });

  it("falls to the rule's unverified verdict for an undeclared problem", () => {
    expect(
      evaluateAnswerRule(
        { ...wholeNumberRule, unverifiedVerdict: "hard_block" },
        { source: "A problem the pack never declares.", target: "4 + 1 = p" }
      )
    ).toMatchObject({ status: "unverified", verdict: "hard_block" });
  });

  it("compares the rounded value the problem declares", () => {
    const source = remainderRule.problems[0]?.text ?? "";

    expect(
      evaluateAnswerRule(remainderRule, { source, target: "27 ÷ 4 = 7" })
    ).toStrictEqual({ status: "verified" });
    expect(
      evaluateAnswerRule(remainderRule, { source, target: "27 ÷ 4 = 6" })
    ).toMatchObject({ status: "mismatch" });
  });

  it("keeps an unparseable remainder annotation at the rule's unverified verdict", () => {
    expect(
      evaluateAnswerRule(remainderRule, {
        source: remainderRule.problems[0]?.text ?? "",
        target: "27 ÷ 4 = t, round up",
      })
    ).toMatchObject({ status: "unverified", verdict: "warning" });
  });

  it("falls to the rule's unverified verdict for an unevaluable target", () => {
    expect(
      evaluateAnswerRule(wholeNumberRule, {
        source: wholeNumberRule.problems[0]?.text ?? "",
        target: "27 ÷ 4 = t, round up",
      })
    ).toMatchObject({ status: "unverified", verdict: "warning" });
  });
});

describe("text-evidence", () => {
  it("verifies a detail present in the passage after normalization", () => {
    expect(
      evaluateAnswerRule(evidenceRule, {
        source: "bees carry pollen, from one flower to the next",
        target: "Bees help plants make seeds.",
      })
    ).toStrictEqual({ status: "verified" });
  });

  it("hard-blocks a detail that is absent from the passage", () => {
    expect(
      evaluateAnswerRule(evidenceRule, {
        source: "Bees sleep through the winter.",
        target: "Bees help plants make seeds.",
      })
    ).toMatchObject({ status: "mismatch" });
  });

  it("does not match a detail that only shares individual words", () => {
    expect(
      evaluateAnswerRule(evidenceRule, {
        source: "pollen from one hive",
        target: "Bees help plants make seeds.",
      })
    ).toMatchObject({ status: "mismatch" });
  });
});

describe("teacher-review", () => {
  it("is always advisory and never a silent pass", () => {
    expect(
      evaluateAnswerRule(teacherReviewRule, {
        source: "any detail",
        target: "any main idea",
      })
    ).toMatchObject({ status: "unverified", verdict: "warning" });
  });
});

describe("evaluating the declared rule set", () => {
  it("fails closed when the pack declares no answer rule", () => {
    expect(
      evaluateAnswerRules([], { source: "1/2", target: "2/4" })
    ).toMatchObject({ status: "unverified", verdict: "hard_block" });
  });

  it("keeps teacher review visible even when another rule verified the pair", () => {
    expect(
      evaluateAnswerRules([fractionRule, teacherReviewRule], {
        source: "1/2",
        target: "2/4",
      })
    ).toMatchObject({ status: "unverified", verdict: "warning" });
  });

  it("lets a definite mismatch outrank a verified or unverified rule", () => {
    expect(
      evaluateAnswerRules([fractionRule, evidenceRule], {
        source: "1/2",
        target: "2/4",
      })
    ).toMatchObject({ status: "mismatch" });
  });

  it("keeps a mismatch visible when a hard_block unverified rule comes first", () => {
    expect(
      evaluateAnswerRules(
        [
          {
            ...wholeNumberRule,
            problems: [{ text: "A different problem.", answer: 5 }],
            unverifiedVerdict: "hard_block",
          },
          fractionRule,
        ],
        { source: "1/2", target: "2/3" }
      )
    ).toMatchObject({ status: "mismatch" });
  });

  it("uses the strictest unverified verdict among the declared rules", () => {
    expect(
      evaluateAnswerRules(
        [fractionRule, { ...wholeNumberRule, unverifiedVerdict: "hard_block" }],
        { source: "one half", target: "two quarters" }
      )
    ).toMatchObject({ status: "unverified", verdict: "hard_block" });
  });
});
