import type { StandardsPack } from "./standards-pack";

/**
 * The interaction shape a standards pack permits. A request for a pattern the
 * pack does not list is refused with a named diagnostic; it never falls back
 * to the pack's first pattern or to generic matching.
 */
export type ScreenPattern = StandardsPack["allowedScreenPatterns"][number];

export interface ScreenPatternRefusal {
  readonly code: "UNSUPPORTED_SCREEN_PATTERN";
  readonly message: string;
  readonly allowed: readonly ScreenPattern[];
}

export type ScreenPatternDecision =
  | { readonly status: "allowed"; readonly pattern: ScreenPattern }
  | { readonly status: "refused"; readonly refusal: ScreenPatternRefusal };

const isAllowedPattern = (
  allowed: readonly ScreenPattern[],
  requested: string
): requested is ScreenPattern => {
  return (allowed as readonly string[]).includes(requested);
};

export const resolveScreenPattern = (
  allowed: readonly ScreenPattern[],
  requested: string
): ScreenPatternDecision => {
  if (isAllowedPattern(allowed, requested)) {
    return { status: "allowed", pattern: requested };
  }

  return {
    status: "refused",
    refusal: {
      code: "UNSUPPORTED_SCREEN_PATTERN",
      message: `This standards pack does not allow a ${requested} screen. It allows only: ${allowed.join(", ")}.`,
      allowed,
    },
  };
};
