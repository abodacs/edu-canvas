import { learningQualityValidatorVersion } from "./semantic-validation-contract";
import { finding, createReview } from "./semantic-validation-utilities";
import type {
  SemanticValidationFinding,
  SemanticValidationInput,
  SemanticValidatorReview,
} from "./semantic-validation-contract";
import type { ProviderVariant } from "./types";

const LEARNING_QUALITY_VALIDATOR_ID = "learning-quality";

const unsafeClaimPatterns = [
  /\b(?:weapon|kill|hurt|self[- ]?harm|suicide)\b/iu,
  /سلاح|قتل|إيذاء|انتحار/iu,
];

const hasUnsafeClaim = (value: string): boolean =>
  unsafeClaimPatterns.some((pattern) => pattern.test(value));

const unsupportedContentPatterns = [
  /https?:\/\//iu,
  /javascript\s*:/iu,
  /<\s*script/iu,
  /api[_ -]?key/iu,
  /secret/iu,
  /answer\s*key/iu,
  /ignore\s+(?:all|any|previous)\s+instructions/iu,
];

const hasUnsupportedContent = (value: string): boolean =>
  unsupportedContentPatterns.some((pattern) => pattern.test(value));

const variantStructureSignature = (variant: ProviderVariant): string => {
  return [
    variant.sourceItems.length,
    variant.targetItems.length,
    variant.distractorItems.length,
    variant.relationships.length,
    variant.hints.length,
    variant.languageMetadata.language,
    variant.languageMetadata.direction,
  ].join(":");
};

const textFields = (
  variant: ProviderVariant
): readonly (readonly [string, string])[] => {
  return [
    ["title", variant.title],
    ["instructions", variant.instructions],
    ...variant.hints.map((hint, index) => [`hints.${index}`, hint] as const),
    ...variant.sourceItems.map(
      (item, index) => [`sourceItems.${index}.label`, item.label] as const
    ),
    ...variant.targetItems.map(
      (item, index) => [`targetItems.${index}.label`, item.label] as const
    ),
    ...variant.distractorItems.map(
      (item, index) => [`distractorItems.${index}.label`, item.label] as const
    ),
    ["feedback.correct", variant.feedback.correct],
    ["feedback.incorrect", variant.feedback.incorrect],
    [
      "accessibilityMetadata.instructions",
      variant.accessibilityMetadata.instructions,
    ],
    [
      "accessibilityMetadata.sourceGroupLabel",
      variant.accessibilityMetadata.sourceGroupLabel,
    ],
    [
      "accessibilityMetadata.targetGroupLabel",
      variant.accessibilityMetadata.targetGroupLabel,
    ],
  ];
};

interface StandardProfile {
  readonly sourceCount: number;
  readonly hintCount: number;
  readonly distractorCount: number;
}

const reviewVariantStructure = (
  variant: ProviderVariant,
  profile: StandardProfile,
  firstVariantId: string | undefined,
  findings: SemanticValidationFinding[]
): void => {
  if (firstVariantId) {
    findings.push(
      finding(LEARNING_QUALITY_VALIDATOR_ID, learningQualityValidatorVersion, {
        verdict: "warning",
        code: "VARIANT_NOT_MEANINGFULLY_DIFFERENT",
        field: "variants",
        variantId: variant.id,
        reason:
          "This variant uses the same interaction structure as another variant and may add review burden without a new learning move.",
        recommendation:
          "Change the scaffold level, interaction structure, or screen purpose while preserving the canonical lesson data.",
      })
    );
  }

  if (
    variant.kind === "scaffold" &&
    variant.hints.length <= profile.hintCount &&
    variant.sourceItems.length >= profile.sourceCount
  ) {
    findings.push(
      finding(LEARNING_QUALITY_VALIDATOR_ID, learningQualityValidatorVersion, {
        verdict: "warning",
        code: "SCAFFOLD_LEVEL_UNCLEAR",
        field: "hints",
        variantId: variant.id,
        reason:
          "The scaffold variant does not show an additional support move.",
        recommendation:
          "Add a scaffold hint or reduce the interaction load for this variant.",
      })
    );
  }

  if (
    variant.kind === "challenge" &&
    variant.hints.length >= profile.hintCount &&
    variant.sourceItems.length <= profile.sourceCount &&
    variant.distractorItems.length <= profile.distractorCount
  ) {
    findings.push(
      finding(LEARNING_QUALITY_VALIDATOR_ID, learningQualityValidatorVersion, {
        verdict: "warning",
        code: "CHALLENGE_LEVEL_UNCLEAR",
        field: "variants",
        variantId: variant.id,
        reason:
          "The challenge variant does not show an additional reasoning demand.",
        recommendation:
          "Increase the reasoning demand while preserving the approved answer relationships.",
      })
    );
  }
};

const hasArabicText = (variant: ProviderVariant): boolean => {
  return [
    variant.title,
    variant.instructions,
    variant.feedback.correct,
    variant.feedback.incorrect,
  ].some((text) => /[\u{600}-\u{6FF}]/u.test(text));
};

const reviewVariantLanguage = (
  variant: ProviderVariant,
  language: SemanticValidationInput["context"]["language"],
  expectedDirection: string,
  findings: SemanticValidationFinding[]
): void => {
  if (variant.languageMetadata.language !== language) {
    findings.push(
      finding(LEARNING_QUALITY_VALIDATOR_ID, learningQualityValidatorVersion, {
        verdict: "block",
        code: "LANGUAGE_MISMATCH",
        field: "languageMetadata",
        variantId: variant.id,
        reason:
          "The variant language does not match the pinned curriculum context.",
        recommendation:
          "Regenerate the variant in the teacher-selected language.",
      })
    );
  }

  if (variant.languageMetadata.direction !== expectedDirection) {
    findings.push(
      finding(LEARNING_QUALITY_VALIDATOR_ID, learningQualityValidatorVersion, {
        verdict: "block",
        code: "DIRECTION_MISMATCH",
        field: "languageMetadata",
        variantId: variant.id,
        reason:
          "The variant direction does not match the selected lesson language.",
        recommendation:
          "Use RTL metadata for Arabic and LTR metadata for English.",
      })
    );
  }

  if (language === "ar" && !hasArabicText(variant)) {
    findings.push(
      finding(LEARNING_QUALITY_VALIDATOR_ID, learningQualityValidatorVersion, {
        verdict: "block",
        code: "LANGUAGE_CONTENT_MISSING",
        field: "instructions",
        variantId: variant.id,
        reason: "The Arabic lesson is missing Arabic explanatory content.",
        recommendation:
          "Provide learner-facing explanations in the selected language.",
      })
    );
  }
};

const reviewVariantCopy = (
  variant: ProviderVariant,
  grade: number,
  findings: SemanticValidationFinding[]
): void => {
  for (const [field, text] of textFields(variant)) {
    if (field.startsWith("accessibilityMetadata.") && !text.trim()) {
      findings.push(
        finding(
          LEARNING_QUALITY_VALIDATOR_ID,
          learningQualityValidatorVersion,
          {
            verdict: "block",
            code: "ACCESSIBILITY_METADATA_MISSING",
            field,
            variantId: variant.id,
            reason: "The variant is missing a required accessibility label.",
            recommendation:
              "Add concise labels for the instructions and both item groups.",
          }
        )
      );
    } else if (hasUnsafeClaim(text)) {
      findings.push(
        finding(
          LEARNING_QUALITY_VALIDATOR_ID,
          learningQualityValidatorVersion,
          {
            verdict: "block",
            code: "UNSAFE_CLAIM",
            field,
            variantId: variant.id,
            reason:
              "The variant contains content that is not safe for a learner activity.",
            recommendation:
              "Remove the unsafe claim and review the lesson before retrying.",
          }
        )
      );
    } else if (hasUnsupportedContent(text)) {
      findings.push(
        finding(
          LEARNING_QUALITY_VALIDATOR_ID,
          learningQualityValidatorVersion,
          {
            verdict: "block",
            code: "UNSUPPORTED_CLAIM",
            field,
            variantId: variant.id,
            reason:
              "The variant contains unsupported executable or external content.",
            recommendation:
              "Keep lesson explanations within the approved curriculum content.",
          }
        )
      );
    }
  }

  if (variant.instructions.trim().length < 20) {
    findings.push(
      finding(LEARNING_QUALITY_VALIDATOR_ID, learningQualityValidatorVersion, {
        verdict: "warning",
        code: "EXPLANATION_TOO_SHORT",
        field: "instructions",
        variantId: variant.id,
        reason:
          "The instructions may not explain the learning move clearly enough.",
        recommendation:
          "Add a concise explanation of what relationship the learner should notice.",
      })
    );
  }

  const wordCount = variant.instructions.trim().split(/\s+/u).length;
  if (grade <= 4 && wordCount > 30) {
    findings.push(
      finding(LEARNING_QUALITY_VALIDATOR_ID, learningQualityValidatorVersion, {
        verdict: "warning",
        code: "READING_LEVEL_TOO_COMPLEX",
        field: "instructions",
        variantId: variant.id,
        reason: "The instructions may be too long for the pinned grade level.",
        recommendation:
          "Shorten the instructions and keep one learner action per sentence.",
      })
    );
  }
};

export const reviewLearningQuality = (
  input: SemanticValidationInput
): SemanticValidatorReview => {
  const findings: SemanticValidationFinding[] = [];
  const signatures = new Map<string, string>();
  const expectedDirection = input.context.language === "ar" ? "rtl" : "ltr";
  const standardGrade = Number(/^\d+/u.exec(input.context.standardCode)?.[0]);
  const standardVariants = input.draft.variants.filter(
    (variant) => variant.kind === "standard"
  );
  const profile: StandardProfile = {
    sourceCount: Math.min(
      ...standardVariants.map((variant) => variant.sourceItems.length)
    ),
    hintCount: Math.max(
      ...standardVariants.map((variant) => variant.hints.length)
    ),
    distractorCount: standardVariants[0]?.distractorItems.length ?? 0,
  };

  if (
    Number.isSafeInteger(standardGrade) &&
    input.context.grade !== standardGrade
  ) {
    findings.push(
      finding(LEARNING_QUALITY_VALIDATOR_ID, learningQualityValidatorVersion, {
        verdict: "block",
        code: "GRADE_LEVEL_MISMATCH",
        field: "curriculum.grade",
        reason:
          "The requested grade does not match the pinned standard grade band.",
        recommendation: "Choose a standard approved for the requested grade.",
      })
    );
  }

  for (const variant of input.draft.variants) {
    const signature = variantStructureSignature(variant);
    const firstVariantId = signatures.get(signature);
    if (!firstVariantId) {
      signatures.set(signature, variant.id);
    }

    reviewVariantStructure(variant, profile, firstVariantId, findings);
    reviewVariantLanguage(
      variant,
      input.context.language,
      expectedDirection,
      findings
    );
    reviewVariantCopy(variant, input.context.grade, findings);
  }

  return createReview(
    LEARNING_QUALITY_VALIDATOR_ID,
    learningQualityValidatorVersion,
    findings
  );
};
