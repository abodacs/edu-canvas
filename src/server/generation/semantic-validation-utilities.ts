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

// Fixed by issue #28's recovery decision: unknown payloads are replaced,
// bounded infrastructure failures are retried, and every other contract or
// relationship break is repaired by editing the artifact.
const replacementRecoveryCodes: ReadonlySet<string> = new Set([
  "UNSAFE_CLAIM",
  "UNSUPPORTED_CLAIM",
]);
const retryRecoveryCodes: ReadonlySet<string> = new Set([
  "VALIDATION_TIMEOUT",
  "VALIDATION_RETRY_EXHAUSTED",
]);

const hardBlockRecovery = (code: string): RecoveryAction => {
  if (retryRecoveryCodes.has(code)) {
    return "retry";
  }
  return replacementRecoveryCodes.has(code) ? "replace" : "edit";
};

export const recoveryForVerdict = (
  verdict: SemanticValidationVerdict,
  code: string
): RecoveryAction | null => {
  switch (verdict) {
    case "pass": {
      return null;
    }
    case "warning": {
      return "edit";
    }
    case "hard_block": {
      return hardBlockRecovery(code);
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

const recoveryPriority: Record<RecoveryAction, number> = {
  retry: 0,
  replace: 1,
  edit: 2,
};

export const reportRecovery = (
  findings: readonly SemanticValidationFinding[]
): RecoveryAction => {
  let recovery: RecoveryAction | undefined;
  for (const item of findings) {
    if (item.verdict === "pass") {
      continue;
    }
    const { recovery: candidateRecovery } = item;
    if (
      !recovery ||
      recoveryPriority[candidateRecovery] < recoveryPriority[recovery]
    ) {
      recovery = candidateRecovery;
    }
  }

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
