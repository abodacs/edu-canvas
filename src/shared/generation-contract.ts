import { z } from "zod";

const gradeValues = [3, 4, 5, 6] as const;
const gradeTextValues = ["3", "4", "5", "6"] as const;
export const difficultyValues = ["support", "on-level", "stretch"] as const;
export const languageValues = ["en", "ar"] as const;
export const semanticValidatorRoleValues = [
  "curriculum",
  "learning-quality",
] as const;
export const semanticValidationVerdictValues = [
  "pass",
  "warning",
  "hard_block",
] as const;
export const recoveryActionValues = ["edit", "replace", "retry"] as const;
export const variantKindValues = ["standard", "scaffold", "challenge"] as const;
export const generationStateValues = [
  "requested",
  "generating",
  "ready-for-review",
  "blocked-by-validation",
  "blocked-by-moderation",
  "failed-retryable",
  "failed-terminal",
] as const;

export const lessonGenerationInputSchema = z
  .object({
    prompt: z.string().trim().min(1).max(500),
    grade: z.union([
      z.union(gradeValues.map((grade) => z.literal(grade))),
      z.enum(gradeTextValues),
    ]),
    standardId: z.string().trim().min(1).max(80),
    language: z.enum(languageValues),
    difficulty: z.enum(difficultyValues).optional(),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
    retryOfRequestId: z.string().trim().min(1).max(80).optional(),
    revisesRequestId: z.string().trim().min(1).max(80).optional(),
    sourceSnapshotId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,80}$/u)
      .optional(),
  })
  .strict();

export const generationRequestErrorCodeValues = [
  "GENERATION_INPUT_INVALID",
  "IDEMPOTENCY_CONFLICT",
  "MODERATION_REVISION_REQUIRED",
  "CURRICULUM_STANDARD_NOT_CONFIGURED",
  "DRAFT_NOT_FOUND",
  "DRAFT_NOT_RETRYABLE",
  "RETRY_METADATA_MISMATCH",
  "DRAFT_SUPERSEDED",
  "CANCELLATION_FORBIDDEN",
  "GENERATION_SOURCE_NOT_READY",
  "RATE_LIMITED",
] as const;

export type GenerationRequestErrorCode =
  (typeof generationRequestErrorCodeValues)[number];

export const generationRequestErrorStatusByCode = {
  GENERATION_INPUT_INVALID: 422,
  IDEMPOTENCY_CONFLICT: 409,
  MODERATION_REVISION_REQUIRED: 422,
  CURRICULUM_STANDARD_NOT_CONFIGURED: 422,
  DRAFT_NOT_FOUND: 404,
  DRAFT_NOT_RETRYABLE: 409,
  RETRY_METADATA_MISMATCH: 409,
  DRAFT_SUPERSEDED: 409,
  CANCELLATION_FORBIDDEN: 409,
  GENERATION_SOURCE_NOT_READY: 422,
  RATE_LIMITED: 429,
} as const satisfies Record<GenerationRequestErrorCode, number>;

export type SemanticValidationVerdict =
  (typeof semanticValidationVerdictValues)[number];
export type RecoveryAction = (typeof recoveryActionValues)[number];
export type LessonGenerationInput = z.infer<typeof lessonGenerationInputSchema>;
export type LessonLanguage = (typeof languageValues)[number];
export type LessonDifficulty = (typeof difficultyValues)[number];
export type PublicVariantKind = (typeof variantKindValues)[number];
export type GenerationState = (typeof generationStateValues)[number];

const publicItemSchema = z
  .object({
    id: z.string(),
    label: z.string(),
  })
  .strict();

export const publicVariantSchema = z
  .object({
    id: z.string(),
    kind: z.enum(variantKindValues),
    title: z.string(),
    instructions: z.string(),
    sourceItems: z.array(publicItemSchema),
    targetItems: z.array(publicItemSchema),
    distractorItems: z.array(publicItemSchema),
    hints: z.array(z.string()),
    feedback: z
      .object({
        correct: z.string(),
        incorrect: z.string(),
      })
      .strict(),
    languageMetadata: z
      .object({
        language: z.enum(languageValues),
        direction: z.enum(["ltr", "rtl"]),
        locale: z.string(),
      })
      .strict(),
    accessibilityMetadata: z
      .object({
        instructions: z.string(),
        sourceGroupLabel: z.string(),
        targetGroupLabel: z.string(),
      })
      .strict(),
  })
  .strict();

export const publicLessonDraftSchema = z
  .object({
    requestId: z.string(),
    prompt: z.string(),
    grade: z.number().int().min(3).max(6),
    standardId: z.string(),
    language: z.enum(languageValues),
    difficulty: z.enum(difficultyValues),
    variants: z.array(publicVariantSchema).length(4),
  })
  .strict();

export const moderationCategoryValues = [
  "personal-data",
  "harmful-content",
  "prompt-injection",
  "unsafe-markup",
  "unserializable",
] as const;

export type ModerationCategory = (typeof moderationCategoryValues)[number];

export const publicGenerationDiagnosticSchema = z
  .object({
    severity: z.enum(["warning", "error"]),
    code: z.string(),
    message: z.string(),
    moderationCategory: z.enum(moderationCategoryValues).optional(),
    variantId: z.string().optional(),
    field: z.string().optional(),
    nodeId: z.string().optional(),
    validator: z.enum(semanticValidatorRoleValues).optional(),
    verdict: z.enum(semanticValidationVerdictValues).optional(),
    validatorVersion: z.string().optional(),
    recommendation: z.string().optional(),
    recovery: z.enum(recoveryActionValues).optional(),
  })
  .strict();

export const publicScreenDiagnosticsSchema = z
  .object({
    variantId: z.string(),
    verdict: z.enum(["warning", "hard_block"]),
    findings: z.array(publicGenerationDiagnosticSchema).min(1),
  })
  .strict();

export const publicDiagnosticsRollupSchema = z
  .object({
    verdict: z.enum(semanticValidationVerdictValues),
    recovery: z.enum(recoveryActionValues).nullable(),
    screens: z.array(publicScreenDiagnosticsSchema),
    flow: z.array(publicGenerationDiagnosticSchema),
    affectedScreens: z.array(z.string()),
  })
  .strict();

export const publicGenerationResultSchema = z
  .object({
    requestId: z.string(),
    state: z.enum(generationStateValues),
    attempt: z.number().int().min(1),
    language: z.enum(languageValues),
    diagnostics: z.array(publicGenerationDiagnosticSchema),
    diagnosticsRollup: publicDiagnosticsRollupSchema,
    draft: publicLessonDraftSchema.nullable(),
    provenance: z
      .object({
        provider: z.string(),
        model: z.string(),
        promptTemplateVersion: z.string(),
        validatorVersion: z.string(),
        catalogVersion: z.string().optional(),
        packVersion: z.string().optional(),
        allowedScreenPatterns: z.array(z.string()).optional(),
      })
      .strict()
      .nullable(),
    retry: z
      .object({
        available: z.boolean(),
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const advisoryReviewFindingSchema = z
  .object({
    code: z.string().min(1),
    field: z.string().min(1),
    reason: z.string().min(1),
    variantId: z.string().optional(),
    nodeId: z.string().optional(),
    recommendation: z.string().optional(),
  })
  .strict();

export const advisoryReviewAgentSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
    validatorVersion: z.string().min(1),
  })
  .strict();

export const advisoryReviewSchema = z
  .object({
    schemaVersion: z.literal("advisory-review-v1"),
    agent: advisoryReviewAgentSchema,
    reviewedAt: z.string().min(1),
    latencyMs: z.number().int().min(0),
    findings: z.array(advisoryReviewFindingSchema),
  })
  .strict();

export const advisoryReviewFailureClassValues = [
  "timeout",
  "agent-failure",
] as const;

export const advisoryReviewFailureSchema = z
  .object({
    class: z.enum(advisoryReviewFailureClassValues),
    message: z.string().min(1),
  })
  .strict();

export const advisoryReviewRunResponseSchema = z.discriminatedUnion("status", [
  z
    .object({ status: z.literal("complete"), review: advisoryReviewSchema })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      failure: advisoryReviewFailureSchema,
    })
    .strict(),
]);

export const advisoryReviewReadResponseSchema = z
  .object({ review: advisoryReviewSchema.nullable() })
  .strict();

export type AdvisoryReview = z.infer<typeof advisoryReviewSchema>;
export type AdvisoryReviewFinding = z.infer<typeof advisoryReviewFindingSchema>;
export type AdvisoryReviewFailure = z.infer<typeof advisoryReviewFailureSchema>;
export type AdvisoryReviewRunResponse = z.infer<
  typeof advisoryReviewRunResponseSchema
>;
export type AdvisoryReviewReadResponse = z.infer<
  typeof advisoryReviewReadResponseSchema
>;

export const storedGenerationResultSchema = z
  .object({
    result: publicGenerationResultSchema,
    prompt: z.string(),
  })
  .strict();

export type StoredGenerationResult = z.infer<
  typeof storedGenerationResultSchema
>;

export type PublicLessonDraft = z.infer<typeof publicLessonDraftSchema>;
export type PublicGenerationDiagnostic = z.infer<
  typeof publicGenerationDiagnosticSchema
>;
export type PublicScreenDiagnostics = z.infer<
  typeof publicScreenDiagnosticsSchema
>;
export type PublicDiagnosticsRollup = z.infer<
  typeof publicDiagnosticsRollupSchema
>;
export type PublicGenerationResult = z.infer<
  typeof publicGenerationResultSchema
>;
