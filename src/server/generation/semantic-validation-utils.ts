import type {
  SemanticValidationFinding,
  SemanticValidationVerdict,
  SemanticValidatorRole,
  SemanticValidatorReview,
} from './semantic-validation-contract'

export function finding(
  validator: SemanticValidatorRole,
  validatorVersion: string,
  values: Omit<SemanticValidationFinding, 'validator' | 'validatorVersion'>,
): SemanticValidationFinding {
  return {
    validator,
    validatorVersion,
    ...values,
  }
}

export function reviewVerdict(
  findings: readonly SemanticValidationFinding[],
): SemanticValidationVerdict {
  if (findings.some((item) => item.verdict === 'block')) return 'block'
  if (findings.some((item) => item.verdict === 'warning')) return 'warning'
  return 'pass'
}

export function reviewReason(
  validator: SemanticValidatorRole,
  verdict: SemanticValidationVerdict,
): string {
  if (verdict === 'pass') return `${validator} validation passed.`
  if (verdict === 'warning') {
    return `${validator} validation needs teacher review.`
  }
  return `${validator} validation found a blocking issue.`
}

export function createReview(
  validator: SemanticValidatorRole,
  validatorVersion: string,
  findings: readonly SemanticValidationFinding[],
): SemanticValidatorReview {
  const reviewFindings = findings.length
    ? findings
    : [
        finding(validator, validatorVersion, {
          verdict: 'pass',
          code: 'VALIDATION_PASSED',
          field: 'draft',
          reason: reviewReason(validator, 'pass'),
        }),
      ]
  const verdict = reviewVerdict(reviewFindings)
  const firstFinding = reviewFindings.at(0)
  return {
    validator,
    validatorVersion,
    verdict,
    field: firstFinding?.field ?? 'draft',
    ...(firstFinding?.nodeId ? { nodeId: firstFinding.nodeId } : {}),
    reason: reviewReason(validator, verdict),
    findings: reviewFindings,
  }
}
