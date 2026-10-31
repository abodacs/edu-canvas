import {
  dominantRecovery,
  recoveryForFinding,
} from "@/server/safety/recovery-policy";

import type {
  RecoveryAction,
  SemanticValidationFinding,
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
