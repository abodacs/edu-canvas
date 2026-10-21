import type {
  SemanticValidationFinding,
  SemanticValidationVerdict,
  SemanticValidatorRole,
  SemanticValidatorReview,
} from "./semantic-validation-contract";

export const finding = (
  validator: SemanticValidatorRole,
  validatorVersion: string,
  values: Omit<SemanticValidationFinding, "validator" | "validatorVersion">
): SemanticValidationFinding => {
  return {
    validator,
    validatorVersion,
    ...values,
  };
};

export const reviewVerdict = (
  findings: readonly SemanticValidationFinding[]
): SemanticValidationVerdict => {
  if (findings.some((item) => item.verdict === "block")) {
    return "block";
  }
  return findings.some((item) => item.verdict === "warning")
    ? "warning"
    : "pass";
};

export const reviewReason = (
  validator: SemanticValidatorRole,
  verdict: SemanticValidationVerdict
): string => {
  if (verdict === "pass") {
    return `${validator} validation passed.`;
  }
  return verdict === "warning"
    ? `${validator} validation needs teacher review.`
    : `${validator} validation found a blocking issue.`;
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
