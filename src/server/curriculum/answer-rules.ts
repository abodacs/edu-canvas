import type { AnswerRule } from "./standards-pack";

/**
 * The answer-rule evaluator. A standards pack declares how its responses may be
 * checked; this module turns one matching relationship plus that declaration
 * into a verified, mismatched, or unverified outcome. It is pure and holds no
 * pack or request state, so each rule kind is table-testable on its own.
 *
 * An unverified outcome always carries the rule's declared verdict. There is no
 * branch that returns a silent pass for a pair the rule could not decide.
 */

export interface AnswerRulePair {
  source: string;
  target: string;
}

export type AnswerRuleEvaluation =
  | { status: "verified" }
  | { status: "mismatch"; reason: string }
  | { status: "unverified"; verdict: "warning" | "hard_block"; reason: string };

type UnverifiedEvaluation = Extract<
  AnswerRuleEvaluation,
  { status: "unverified" }
>;

interface Fraction {
  numerator: number;
  denominator: number;
}

const whitespacePattern = /\s/u;
const wordTokenPattern = /[\p{L}\p{N}\p{M}]+/gu;
const integerTokenPattern = /^\d$/u;
const fractionPattern = /^(?<numerator>\d+)\s*\/\s*(?<denominator>\d+)$/u;
const unknownSymbolPattern = /^\p{L}$/u;

/**
 * The comparison form for text a rule checks literally: case, whitespace, and
 * punctuation are folded, and the words are joined with one space. Rules that
 * match a phrase use the token list, so a word fragment never matches.
 */
export const normalizeAnswerText = (value: string): string => {
  return (
    value.normalize("NFKC").toLowerCase().match(wordTokenPattern)?.join(" ") ??
    ""
  );
};

const containsPhrase = (haystack: string, needle: string): boolean => {
  const haystackTokens = haystack.split(" ").filter(Boolean);
  const needleTokens = needle.split(" ").filter(Boolean);
  if (
    needleTokens.length === 0 ||
    needleTokens.length > haystackTokens.length
  ) {
    return false;
  }

  const lastStart = haystackTokens.length - needleTokens.length;
  for (let start = 0; start <= lastStart; start += 1) {
    const isMatch = needleTokens.every(
      (token, offset) => haystackTokens[start + offset] === token
    );
    if (isMatch) {
      return true;
    }
  }
  return false;
};

const parseFraction = (label: string): Fraction | undefined => {
  const match = fractionPattern.exec(label.trim());
  if (!match) {
    return undefined;
  }

  const numerator = Number(match.groups?.numerator);
  const denominator = Number(match.groups?.denominator);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    return undefined;
  }
  return denominator === 0 ? undefined : { numerator, denominator };
};

const areFractionsEquivalent = (left: Fraction, right: Fraction): boolean => {
  return (
    BigInt(left.numerator) * BigInt(right.denominator) ===
    BigInt(right.numerator) * BigInt(left.denominator)
  );
};

type Operator = "+" | "-" | "×" | "÷";

type ExpressionToken =
  | { kind: "integer"; value: number }
  | { kind: "operator"; value: Operator }
  | { kind: "leftParen" }
  | { kind: "rightParen" };

export type WholeNumberEquationEvaluation =
  | { status: "evaluated"; value: number }
  | { status: "non-integer" }
  | { status: "invalid" };

const isDigit = (character: string): boolean =>
  integerTokenPattern.test(character);

const operatorFor = (character: string): Operator | undefined => {
  switch (character) {
    case "+": {
      return "+";
    }
    case "-":
    case "−": {
      return "-";
    }
    case "×":
    case "*": {
      return "×";
    }
    case "÷":
    case "/": {
      return "÷";
    }
    default: {
      return undefined;
    }
  }
};

/**
 * A bounded tokenizer: integers, `+ - × ÷`, ASCII aliases, and parentheses.
 * Anything else makes the expression unreadable rather than executable.
 */
const tokenizeExpression = (
  expression: string
): readonly ExpressionToken[] | undefined => {
  const tokens: ExpressionToken[] = [];
  let index = 0;

  while (index < expression.length) {
    const character = expression[index];
    if (character === undefined) {
      break;
    }

    if (whitespacePattern.test(character)) {
      index += 1;
      continue;
    }

    if (isDigit(character)) {
      let end = index;
      while (isDigit(expression[end] ?? "")) {
        end += 1;
      }
      const value = Number(expression.slice(index, end));
      if (!Number.isSafeInteger(value)) {
        return undefined;
      }
      tokens.push({ kind: "integer", value });
      index = end;
      continue;
    }

    if (character === "(") {
      tokens.push({ kind: "leftParen" });
      index += 1;
      continue;
    }

    if (character === ")") {
      tokens.push({ kind: "rightParen" });
      index += 1;
      continue;
    }

    const operator = operatorFor(character);
    if (!operator) {
      return undefined;
    }
    tokens.push({ kind: "operator", value: operator });
    index += 1;
  }

  return tokens;
};

const safeResult = (value: number): WholeNumberEquationEvaluation => {
  return Number.isSafeInteger(value)
    ? { status: "evaluated", value }
    : { status: "invalid" };
};

const applyOperator = (
  left: number,
  operator: Operator,
  right: number
): WholeNumberEquationEvaluation => {
  switch (operator) {
    case "+": {
      return safeResult(left + right);
    }
    case "-": {
      return safeResult(left - right);
    }
    case "×": {
      return safeResult(left * right);
    }
    case "÷": {
      if (right === 0) {
        return { status: "invalid" };
      }
      if (left % right !== 0) {
        return { status: "non-integer" };
      }
      return safeResult(left / right);
    }
    default: {
      const exhaustive: never = operator;
      throw new Error(`Unhandled whole-number operator: ${exhaustive}`);
    }
  }
};

const operatorPrecedence: Readonly<Record<Operator, number>> = {
  "+": 1,
  "-": 1,
  "×": 2,
  "÷": 2,
};

/**
 * Shunting-yard conversion keeps the parser iterative and bounded: no
 * recursion, no `eval`, and parentheses have exactly one meaning.
 */
const toPostfix = (
  tokens: readonly ExpressionToken[]
): readonly ExpressionToken[] | undefined => {
  const output: ExpressionToken[] = [];
  const operators: ExpressionToken[] = [];

  for (const token of tokens) {
    switch (token.kind) {
      case "integer": {
        output.push(token);
        break;
      }
      case "operator": {
        let top = operators.at(-1);
        while (
          top?.kind === "operator" &&
          operatorPrecedence[top.value] >= operatorPrecedence[token.value]
        ) {
          const popped = operators.pop();
          if (!popped) {
            return undefined;
          }
          output.push(popped);
          top = operators.at(-1);
        }
        operators.push(token);
        break;
      }
      case "leftParen": {
        operators.push(token);
        break;
      }
      case "rightParen": {
        let top = operators.pop();
        while (top && top.kind !== "leftParen") {
          output.push(top);
          top = operators.pop();
        }
        if (!top) {
          return undefined;
        }
        break;
      }
      default: {
        const exhaustive: never = token;
        throw new Error(`Unhandled expression token: ${exhaustive}`);
      }
    }
  }

  let top = operators.pop();
  while (top) {
    if (top.kind === "leftParen") {
      return undefined;
    }
    output.push(top);
    top = operators.pop();
  }
  return output;
};

const evaluatePostfix = (
  postfix: readonly ExpressionToken[]
): WholeNumberEquationEvaluation => {
  const values: number[] = [];

  for (const token of postfix) {
    if (token.kind === "integer") {
      values.push(token.value);
      continue;
    }
    if (token.kind !== "operator") {
      return { status: "invalid" };
    }

    const right = values.pop();
    const left = values.pop();
    if (left === undefined || right === undefined) {
      return { status: "invalid" };
    }
    const result = applyOperator(left, token.value, right);
    if (result.status !== "evaluated") {
      return result;
    }
    values.push(result.value);
  }

  const [value] = values;
  return values.length === 1 && value !== undefined
    ? { status: "evaluated", value }
    : { status: "invalid" };
};

/**
 * Parses `<expression> = <symbol>` and evaluates the expression with
 * whole-number arithmetic. A division that does not divide exactly is a
 * non-integer result, not a crash; it cannot equal a whole-number answer.
 */
export const parseWholeNumberEquation = (
  target: string
): WholeNumberEquationEvaluation => {
  const normalized = target.normalize("NFKC");
  const equalsIndex = normalized.indexOf("=");
  if (equalsIndex === -1 || normalized.includes("=", equalsIndex + 1)) {
    return { status: "invalid" };
  }

  const expression = normalized.slice(0, equalsIndex).trim();
  const symbol = normalized.slice(equalsIndex + 1).trim();
  if (!expression || !symbol || !unknownSymbolPattern.test(symbol)) {
    return { status: "invalid" };
  }

  const tokens = tokenizeExpression(expression);
  if (!tokens || tokens.length === 0) {
    return { status: "invalid" };
  }

  const postfix = toPostfix(tokens);
  return postfix ? evaluatePostfix(postfix) : { status: "invalid" };
};

const evaluateFractionEquivalence = (
  rule: Extract<AnswerRule, { kind: "fraction-equivalence" }>,
  pair: AnswerRulePair
): AnswerRuleEvaluation => {
  const source = parseFraction(pair.source);
  const target = parseFraction(pair.target);
  if (!source || !target) {
    return {
      status: "unverified",
      verdict: rule.unverifiedVerdict,
      reason:
        "The validator could not read both relationship labels as fractions under the approved rule.",
    };
  }

  return areFractionsEquivalent(source, target)
    ? { status: "verified" }
    : {
        status: "mismatch",
        reason:
          "A matching relationship conflicts with the approved equivalent-fractions rule.",
      };
};

const evaluateWholeNumberExpression = (
  rule: Extract<AnswerRule, { kind: "whole-number-expression" }>,
  pair: AnswerRulePair
): AnswerRuleEvaluation => {
  const source = normalizeAnswerText(pair.source);
  const declared = rule.problems.find(
    (problem) => normalizeAnswerText(problem.text) === source
  );
  if (!declared) {
    return {
      status: "unverified",
      verdict: rule.unverifiedVerdict,
      reason:
        "The pack declares no answer for the matched problem, so the rule could not verify the relationship.",
    };
  }

  if (!Number.isSafeInteger(declared.answer)) {
    return {
      status: "unverified",
      verdict: rule.unverifiedVerdict,
      reason:
        "The pack declares a non-whole-number answer for a whole-number rule.",
    };
  }

  const evaluation = parseWholeNumberEquation(pair.target);
  switch (evaluation.status) {
    case "evaluated": {
      return evaluation.value === declared.answer
        ? { status: "verified" }
        : {
            status: "mismatch",
            reason:
              "A matching relationship conflicts with the answer the pack declares for the matched problem.",
          };
    }
    case "non-integer": {
      return {
        status: "mismatch",
        reason:
          "The target equation does not evaluate to the whole-number answer the pack declares.",
      };
    }
    case "invalid": {
      return {
        status: "unverified",
        verdict: rule.unverifiedVerdict,
        reason:
          "The target is not an equation this rule can evaluate with whole-number arithmetic.",
      };
    }
    default: {
      const exhaustive: never = evaluation;
      throw new Error(`Unhandled equation evaluation: ${exhaustive}`);
    }
  }
};

const evaluateTextEvidence = (
  rule: Extract<AnswerRule, { kind: "text-evidence" }>,
  pair: AnswerRulePair
): AnswerRuleEvaluation => {
  const source = normalizeAnswerText(pair.source);
  if (!source) {
    return {
      status: "unverified",
      verdict: rule.unverifiedVerdict,
      reason:
        "The relationship carries no detail the rule can find in the passage.",
    };
  }

  return containsPhrase(normalizeAnswerText(rule.passage), source)
    ? { status: "verified" }
    : {
        status: "mismatch",
        reason:
          "A matching relationship cites a detail that is not present in the approved passage.",
      };
};

const evaluateTeacherReview = (
  rule: Extract<AnswerRule, { kind: "teacher-review" }>
): AnswerRuleEvaluation => {
  return {
    status: "unverified",
    verdict: rule.unverifiedVerdict,
    reason:
      "The pack asks a teacher to review this relationship before it reaches a learner.",
  };
};

/**
 * The rule registry. Each kind owns exactly one evaluator, so adding a kind
 * without a decision path fails typecheck rather than falling through.
 */
const answerRuleEvaluators: {
  readonly [K in AnswerRule["kind"]]: (
    rule: Extract<AnswerRule, { kind: K }>,
    pair: AnswerRulePair
  ) => AnswerRuleEvaluation;
} = {
  "fraction-equivalence": evaluateFractionEquivalence,
  "whole-number-expression": evaluateWholeNumberExpression,
  "text-evidence": evaluateTextEvidence,
  "teacher-review": evaluateTeacherReview,
};

export const evaluateAnswerRule = (
  rule: AnswerRule,
  pair: AnswerRulePair
): AnswerRuleEvaluation => {
  switch (rule.kind) {
    case "fraction-equivalence": {
      return answerRuleEvaluators["fraction-equivalence"](rule, pair);
    }
    case "whole-number-expression": {
      return answerRuleEvaluators["whole-number-expression"](rule, pair);
    }
    case "text-evidence": {
      return answerRuleEvaluators["text-evidence"](rule, pair);
    }
    case "teacher-review": {
      return answerRuleEvaluators["teacher-review"](rule, pair);
    }
    default: {
      const exhaustive: never = rule;
      throw new Error(`Unhandled answer rule: ${String(exhaustive)}`);
    }
  }
};

/**
 * Collapses every declared rule to one decision for the pair. A definite
 * mismatch outranks every other outcome; otherwise the strictest unverified
 * verdict wins, so a rule that could not decide never reads as a pass.
 */
export const evaluateAnswerRules = (
  rules: readonly AnswerRule[],
  pair: AnswerRulePair
): AnswerRuleEvaluation => {
  if (rules.length === 0) {
    return {
      status: "unverified",
      verdict: "hard_block",
      reason:
        "The standards pack declares no answer rule, so the validator cannot verify this relationship.",
    };
  }

  let firstUnverified: UnverifiedEvaluation | undefined;
  for (const rule of rules) {
    const evaluation = evaluateAnswerRule(rule, pair);
    if (evaluation.status === "mismatch") {
      return evaluation;
    }
    if (evaluation.status === "unverified") {
      if (evaluation.verdict === "hard_block") {
        return evaluation;
      }
      firstUnverified ??= evaluation;
    }
  }

  return firstUnverified ?? { status: "verified" };
};
