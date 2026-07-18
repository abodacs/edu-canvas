import type {
  SemanticValidationFinding,
  SemanticValidationInput,
  SemanticValidatorReview,
} from './semantic-validation-contract'
import { learningQualityValidatorVersion } from './semantic-validation-contract'
import { finding, createReview } from './semantic-validation-utils'
import type { ProviderVariant } from './types'

function variantStructureSignature(variant: ProviderVariant): string {
  return [
    variant.sourceItems.length,
    variant.targetItems.length,
    variant.distractorItems.length,
    variant.relationships.length,
    variant.hints.length,
    variant.languageMetadata.language,
    variant.languageMetadata.direction,
  ].join(':')
}

function textFields(
  variant: ProviderVariant,
): ReadonlyArray<readonly [string, string]> {
  return [
    ['title', variant.title],
    ['instructions', variant.instructions],
    ...variant.hints.map((hint, index) => [`hints.${index}`, hint] as const),
    ...variant.sourceItems.map(
      (item, index) => [`sourceItems.${index}.label`, item.label] as const,
    ),
    ...variant.targetItems.map(
      (item, index) => [`targetItems.${index}.label`, item.label] as const,
    ),
    ...variant.distractorItems.map(
      (item, index) => [`distractorItems.${index}.label`, item.label] as const,
    ),
    ['feedback.correct', variant.feedback.correct],
    ['feedback.incorrect', variant.feedback.incorrect],
    [
      'accessibilityMetadata.instructions',
      variant.accessibilityMetadata.instructions,
    ],
    [
      'accessibilityMetadata.sourceGroupLabel',
      variant.accessibilityMetadata.sourceGroupLabel,
    ],
    [
      'accessibilityMetadata.targetGroupLabel',
      variant.accessibilityMetadata.targetGroupLabel,
    ],
  ]
}

export function reviewLearningQuality(
  input: SemanticValidationInput,
): SemanticValidatorReview {
  const findings: SemanticValidationFinding[] = []
  const signatures = new Map<string, string>()
  const expectedDirection = input.context.language === 'ar' ? 'rtl' : 'ltr'
  const unsafeClaimPattern =
    /(?:\b(?:weapon|kill|hurt|self[- ]?harm|suicide)\b|سلاح|قتل|إيذاء|انتحار)/iu
  const unsupportedContentPattern =
    /(?:https?:\/\/|javascript\s*:|<\s*script|api[_ -]?key|secret|answer\s*key|ignore\s+(?:all|any|previous)\s+instructions)/i
  const standardGrade = Number(/^\d+/.exec(input.context.standardCode)?.[0])
  const standardVariants = input.draft.variants.filter(
    (variant) => variant.kind === 'standard',
  )
  const standardSourceCount = Math.min(
    ...standardVariants.map((variant) => variant.sourceItems.length),
  )
  const standardHintCount = Math.max(
    ...standardVariants.map((variant) => variant.hints.length),
  )

  if (
    Number.isSafeInteger(standardGrade) &&
    input.context.grade !== standardGrade
  ) {
    findings.push(
      finding('learning-quality', learningQualityValidatorVersion, {
        verdict: 'block',
        code: 'GRADE_LEVEL_MISMATCH',
        field: 'curriculum.grade',
        reason:
          'The requested grade does not match the pinned standard grade band.',
        recommendation: 'Choose a standard approved for the requested grade.',
      }),
    )
  }

  for (const variant of input.draft.variants) {
    const signature = variantStructureSignature(variant)
    const firstVariantId = signatures.get(signature)
    if (firstVariantId) {
      findings.push(
        finding('learning-quality', learningQualityValidatorVersion, {
          verdict: 'warning',
          code: 'VARIANT_NOT_MEANINGFULLY_DIFFERENT',
          field: 'variants',
          variantId: variant.id,
          reason:
            'This variant uses the same interaction structure as another variant and may add review burden without a new learning move.',
          recommendation:
            'Change the scaffold level, interaction structure, or screen purpose while preserving the canonical lesson data.',
        }),
      )
    } else {
      signatures.set(signature, variant.id)
    }

    if (
      variant.kind === 'scaffold' &&
      variant.hints.length <= standardHintCount &&
      variant.sourceItems.length >= standardSourceCount
    ) {
      findings.push(
        finding('learning-quality', learningQualityValidatorVersion, {
          verdict: 'warning',
          code: 'SCAFFOLD_LEVEL_UNCLEAR',
          field: 'hints',
          variantId: variant.id,
          reason:
            'The scaffold variant does not show an additional support move.',
          recommendation:
            'Add a scaffold hint or reduce the interaction load for this variant.',
        }),
      )
    }

    if (
      variant.kind === 'challenge' &&
      variant.hints.length >= standardHintCount &&
      variant.sourceItems.length <= standardSourceCount &&
      variant.distractorItems.length <=
        (standardVariants[0]?.distractorItems.length ?? 0)
    ) {
      findings.push(
        finding('learning-quality', learningQualityValidatorVersion, {
          verdict: 'warning',
          code: 'CHALLENGE_LEVEL_UNCLEAR',
          field: 'variants',
          variantId: variant.id,
          reason:
            'The challenge variant does not show an additional reasoning demand.',
          recommendation:
            'Increase the reasoning demand while preserving the approved answer relationships.',
        }),
      )
    }

    if (variant.languageMetadata.language !== input.context.language) {
      findings.push(
        finding('learning-quality', learningQualityValidatorVersion, {
          verdict: 'block',
          code: 'LANGUAGE_MISMATCH',
          field: 'languageMetadata',
          variantId: variant.id,
          reason:
            'The variant language does not match the pinned curriculum context.',
          recommendation:
            'Regenerate the variant in the teacher-selected language.',
        }),
      )
    }

    if (variant.languageMetadata.direction !== expectedDirection) {
      findings.push(
        finding('learning-quality', learningQualityValidatorVersion, {
          verdict: 'block',
          code: 'DIRECTION_MISMATCH',
          field: 'languageMetadata',
          variantId: variant.id,
          reason:
            'The variant direction does not match the selected lesson language.',
          recommendation:
            'Use RTL metadata for Arabic and LTR metadata for English.',
        }),
      )
    }

    for (const [field, text] of textFields(variant)) {
      if (field.startsWith('accessibilityMetadata.') && !text.trim()) {
        findings.push(
          finding('learning-quality', learningQualityValidatorVersion, {
            verdict: 'block',
            code: 'ACCESSIBILITY_METADATA_MISSING',
            field,
            variantId: variant.id,
            reason: 'The variant is missing a required accessibility label.',
            recommendation:
              'Add concise labels for the instructions and both item groups.',
          }),
        )
      } else if (unsafeClaimPattern.test(text)) {
        findings.push(
          finding('learning-quality', learningQualityValidatorVersion, {
            verdict: 'block',
            code: 'UNSAFE_CLAIM',
            field,
            variantId: variant.id,
            reason:
              'The variant contains content that is not safe for a learner activity.',
            recommendation:
              'Remove the unsafe claim and review the lesson before retrying.',
          }),
        )
      } else if (unsupportedContentPattern.test(text)) {
        findings.push(
          finding('learning-quality', learningQualityValidatorVersion, {
            verdict: 'block',
            code: 'UNSUPPORTED_CLAIM',
            field,
            variantId: variant.id,
            reason:
              'The variant contains unsupported executable or external content.',
            recommendation:
              'Keep lesson explanations within the approved curriculum content.',
          }),
        )
      }
    }

    if (input.context.language === 'ar') {
      const hasArabicExplanation = [
        variant.title,
        variant.instructions,
        variant.feedback.correct,
        variant.feedback.incorrect,
      ].some((text) => /[\u0600-\u06ff]/u.test(text))
      if (!hasArabicExplanation) {
        findings.push(
          finding('learning-quality', learningQualityValidatorVersion, {
            verdict: 'block',
            code: 'LANGUAGE_CONTENT_MISSING',
            field: 'instructions',
            variantId: variant.id,
            reason: 'The Arabic lesson is missing Arabic explanatory content.',
            recommendation:
              'Provide learner-facing explanations in the selected language.',
          }),
        )
      }
    }

    if (variant.instructions.trim().length < 20) {
      findings.push(
        finding('learning-quality', learningQualityValidatorVersion, {
          verdict: 'warning',
          code: 'EXPLANATION_TOO_SHORT',
          field: 'instructions',
          variantId: variant.id,
          reason:
            'The instructions may not explain the learning move clearly enough.',
          recommendation:
            'Add a concise explanation of what relationship the learner should notice.',
        }),
      )
    }

    const wordCount = variant.instructions.trim().split(/\s+/u).length
    if (input.context.grade <= 4 && wordCount > 30) {
      findings.push(
        finding('learning-quality', learningQualityValidatorVersion, {
          verdict: 'warning',
          code: 'READING_LEVEL_TOO_COMPLEX',
          field: 'instructions',
          variantId: variant.id,
          reason:
            'The instructions may be too long for the pinned grade level.',
          recommendation:
            'Shorten the instructions and keep one learner action per sentence.',
        }),
      )
    }
  }

  return createReview(
    'learning-quality',
    learningQualityValidatorVersion,
    findings,
  )
}
