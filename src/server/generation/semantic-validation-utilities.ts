import {
  dominantRecovery,
  recoveryForFinding,
} from "@/server/safety/recovery-policy";

import type {
  RecoveryAction,
  SemanticAgentRecommendation,
  SemanticValidationFinding,
  SemanticValidationInput,
  SemanticValidationVerdict,
  SemanticValidatorRole,
  SemanticValidatorReview,
} from "./semantic-validation-contract";

interface SemanticValidationFindingSeedBase {
  code: string;
  field: string;
  reason: string;
  variantId?: string;
  nodeId?: string;
  recommendation?: string;
}

type SemanticValidationFindingSeed =
  | (SemanticValidationFindingSeedBase & { verdict: "pass" })
  | (SemanticValidationFindingSeedBase & {
      verdict: "warning" | "hard_block";
    });

export const recoveryForVerdict = (
  verdict: SemanticValidationVerdict,
  code: string
): RecoveryAction | null => {
  switch (verdict) {
    case "pass": {
      return null;
    }
    case "warning":
    case "hard_block": {
      return recoveryForFinding(code, verdict);
    }
    default: {
      const exhaustive: never = verdict;
      throw new Error(`Unhandled semantic validation verdict: ${exhaustive}`);
    }
  }
};

export const finding = (
  validator: SemanticValidatorRole,
  validatorVersion: string,
  values: SemanticValidationFindingSeed
): SemanticValidationFinding => {
  switch (values.verdict) {
    case "pass": {
      return { validator, validatorVersion, ...values };
    }
    case "warning":
    case "hard_block": {
      const recovery = recoveryForVerdict(values.verdict, values.code);
      if (!recovery) {
        throw new Error("An actionable finding must carry a recovery action.");
      }
      return { validator, validatorVersion, ...values, recovery };
    }
    default: {
      const exhaustive: never = values;
      throw new Error(
        `Unhandled semantic validation finding: ${String(exhaustive)}`
      );
    }
  }
};

export const reviewVerdict = (
  findings: readonly SemanticValidationFinding[]
): SemanticValidationVerdict => {
  if (findings.some((item) => item.verdict === "hard_block")) {
    return "hard_block";
  }
  return findings.some((item) => item.verdict === "warning")
    ? "warning"
    : "pass";
};

export const reportRecovery = (
  findings: readonly SemanticValidationFinding[]
): RecoveryAction => {
  const recovery = dominantRecovery(
    findings.flatMap((item) => (item.verdict === "pass" ? [] : [item.recovery]))
  );

  if (!recovery) {
    throw new Error("A non-pass report needs at least one non-pass finding.");
  }
  return recovery;
};

export const reviewReason = (
  validator: SemanticValidatorRole,
  verdict: SemanticValidationVerdict
): string => {
  switch (verdict) {
    case "pass": {
      return `${validator} validation passed.`;
    }
    case "warning": {
      return `${validator} validation needs teacher review.`;
    }
    case "hard_block": {
      return `${validator} validation found a blocking issue.`;
    }
    default: {
      const exhaustive: never = verdict;
      throw new Error(`Unhandled semantic validation verdict: ${exhaustive}`);
    }
  }
};

export const createReview = (
  validator: SemanticValidatorRole,
  validatorVersion: string,
  findings: readonly SemanticValidationFinding[]
): SemanticValidatorReview => {
  const reviewFindings = findings.length
    ? findings
    : [
        finding(validator, validatorVersion, {
          verdict: "pass",
          code: "VALIDATION_PASSED",
          field: "draft",
          reason: reviewReason(validator, "pass"),
        }),
      ];
  const verdict = reviewVerdict(reviewFindings);
  const firstFinding = reviewFindings.at(0);
  return {
    validator,
    validatorVersion,
    verdict,
    field: firstFinding?.field ?? "draft",
    ...(firstFinding?.nodeId && { nodeId: firstFinding.nodeId }),
    reason: reviewReason(validator, verdict),
    findings: reviewFindings,
  };
};

const unsafeAgentTextPatterns = [
  /answer\s*key/iu,
  /api\s*key/iu,
  /secret/iu,
  /student/iu,
  /chain[- ]of[- ]thought/iu,
  /\d{1,9}\s{0,3}\/\s{0,3}\d{1,9}/iu,
];

const hasUnsafeAgentText = (value: string): boolean => {
  return unsafeAgentTextPatterns.some((pattern) => pattern.test(value));
};

/**
The single text boundary for model-authored recommendation fields. Both the
inline semantic runner and the async advisory reviewer use it, so a provider
that echoes an answer key, a credential marker, or student wording cannot reach
a teacher-facing finding.
*/
export const safeAgentText = (value: string, fallback: string): string => {
  const text = value.trim().replaceAll(/\s+/gu, " ");
  return !text || text.length > 240 || hasUnsafeAgentText(text)
    ? fallback
    : text;
};

const isUnsafeIdentifier = (value: string): boolean => {
  return (
    value.length > 80 ||
    !/^[a-z][a-z0-9_.:-]*$/iu.test(value) ||
    /student|learner|identity|user/iu.test(value)
  );
};

export const safeIdentifier = (
  value: string | undefined
): string | undefined =>
  value && !isUnsafeIdentifier(value) ? value : undefined;

/**
The advisory recommendation fields after sanitization. It carries no verdict:
every consumer turns these into warnings, never into a block.
*/
export interface SanitizedRecommendation {
  code: "AGENT_RECOMMENDATION";
  field: string;
  reason: string;
  variantId?: string;
  nodeId?: string;
  recommendation?: string;
}

export const sanitizedRecommendation = (
  recommendation: SemanticAgentRecommendation
): SanitizedRecommendation => {
  const variantId = safeIdentifier(recommendation.variantId);
  const nodeId = safeIdentifier(recommendation.nodeId);
  return {
    code: "AGENT_RECOMMENDATION",
    field: safeAgentText(recommendation.field ?? "draft", "draft"),
    ...(variantId && { variantId }),
    ...(nodeId && { nodeId }),
    reason: safeAgentText(
      recommendation.reason,
      "A validator recommendation needs teacher review."
    ),
    ...(recommendation.recommendation && {
      recommendation: safeAgentText(
        recommendation.recommendation,
        "Review this recommendation before continuing."
      ),
    }),
  };
};

export const sanitizedRecommendations = (
  recommendations: readonly SemanticAgentRecommendation[]
): SanitizedRecommendation[] => {
  return recommendations
    .filter((recommendation) => recommendation.verdict !== "pass")
    .map(sanitizedRecommendation);
};

/**
An advisory agent reviews learning quality, never private answer keys. The
clone drops relationships and every other value the reviewer does not need.
*/
export const cloneSemanticValidationInput = (
  input: SemanticValidationInput
): SemanticValidationInput => {
  return {
    draft: {
      variants: input.draft.variants.map((variant) => {
        return {
          ...variant,
          sourceItems: variant.sourceItems.map((item) => ({ ...item })),
          targetItems: variant.targetItems.map((item) => ({ ...item })),
          distractorItems: variant.distractorItems.map((item) => ({ ...item })),
          relationships: [],
          hints: [...variant.hints],
          feedback: { ...variant.feedback },
          languageMetadata: { ...variant.languageMetadata },
          accessibilityMetadata: { ...variant.accessibilityMetadata },
        };
      }),
    },
    context: {
      ...input.context,
      nodes: input.context.nodes.map((node) => ({ ...node })),
      edges: input.context.edges.map((edge) => ({ ...edge })),
    },
    ...(input.path && {
      path: {
        ...input.path,
        nodeIds: [...input.path.nodeIds],
        ...(input.path.screenPurposeIds && {
          screenPurposeIds: [...input.path.screenPurposeIds],
        }),
      },
    }),
  };
};
