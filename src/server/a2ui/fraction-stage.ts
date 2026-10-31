// #116: stage and value authorization decisions for fractions-v2. Pure
// functions in the coding-patterns sense: the caller loads the facts and
// applies authorized effects, so compile-time validation and the future
// learner delivery seam (#6/#7) share one decision implementation.

export type FractionStageDecision =
  | { ok: true; nextSectionId: string }
  | {
      ok: false;
      code: "STAGE_NOT_FOUND" | "STAGE_NOT_PERMITTED" | "STAGE_COMPLETE";
      message: string;
    };

// A learner may only advance to the immediately next stage in the section
// order; skipping or revisiting stages is never permitted.
export const permittedStageAfter = (
  orderedSectionIds: readonly string[],
  completedSectionId: string
): FractionStageDecision => {
  const index = orderedSectionIds.indexOf(completedSectionId);
  if (index === -1) {
    return {
      ok: false,
      code: "STAGE_NOT_FOUND",
      message: "The requested stage is not part of this lesson run.",
    };
  }

  const next = orderedSectionIds[index + 1];
  if (!next) {
    return {
      ok: false,
      code: "STAGE_COMPLETE",
      message: "The lesson run has no further permitted stage.",
    };
  }

  return { ok: true, nextSectionId: next };
};

export type FractionValueDecision =
  | { ok: true; numerator: number }
  | { ok: false; code: "INVALID_FRACTION_VALUE"; message: string };

export const FRACTION_DENOMINATOR_MINIMUM = 1;
export const FRACTION_DENOMINATOR_MAXIMUM = 12;

// The fraction value authorization: an integer numerator 0 through a whole
// denominator 1-12. Mirrors the contract bounds so a learner event and the
// compiled surface agree on the trusted range.
const isTrustedDenominator = (denominator: number): boolean => {
  return (
    Number.isSafeInteger(denominator) &&
    denominator >= FRACTION_DENOMINATOR_MINIMUM &&
    denominator <= FRACTION_DENOMINATOR_MAXIMUM
  );
};

const isTrustedNumerator = (numerator: number, denominator: number): boolean =>
  Number.isSafeInteger(numerator) && numerator >= 0 && numerator <= denominator;

export const decideFractionValue = (input: {
  numerator: number;
  denominator: number;
}): FractionValueDecision => {
  const { numerator, denominator } = input;
  const areBoundsTrusted =
    isTrustedDenominator(denominator) && isTrustedNumerator(numerator, denominator);

  if (!areBoundsTrusted) {
    return {
      ok: false,
      code: "INVALID_FRACTION_VALUE",
      message: "The fraction value is outside the trusted bounds.",
    };
  }

  return { ok: true, numerator };
};
