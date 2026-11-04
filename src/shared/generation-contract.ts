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
    /**
    #148: the `blocked-by-moderation` request this one revises. A revision is a new request with changed input, not a retry of the blocked record.
    */
    revisesRequestId: z.string().trim().min(1).max(80).optional(),
    sourceSnapshotId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,80}$/u)
      .optional(),
  })
  .strict();

/**
Stable machine codes the generation delivery seam rejects requests with, and
the transport status each maps to, following the seam conventions (identity
`CONFLICT` 409, `INVALID_INPUT` 422) and the design-doc error table
(`NOT_FOUND` 404; conflict-family codes 409; revise-the-request codes 422).
The client reads the same table to learn which rejections carry a curated, teacher-ready server message it must surface verbatim.
*/
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

/**
#132: the reviewed moderation category. A teacher sees this word, never the
internal diagnostic code. `unserializable` is the fail-closed case where the
screened value could not be serialized at all.
*/
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
    /**
     * Present only on a moderation block. It names the category the teacher must revise, without exposing the rule set or the matching text.
     */
    moderationCategory: z.enum(moderationCategoryValues).optional(),
    variantId: z.string().optional(),
    field: z.string().optional(),
    nodeId: z.string().optional(),
    validator: z.enum(semanticValidatorRoleValues).optional(),
    verdict: z.enum(semanticValidationVerdictValues).optional(),
    validatorVersion: z.string().optional(),
    recommendation: z.string().optional(),
    /**
     * The single teacher action for this finding. Optional so a payload from an older server still parses; the current server always sets it.
     */
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
    /**
     * One entry per screen with a non-pass finding. The flow-level roll-up names every affected screen here, so a warning never disappears between the screen and the lesson.
     */
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
    /**
     * The record input language. It stays available when a blocked record has no draft, so the result can keep its reading direction.
     */
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
        /**
         * The standards pack that shaped the draft and the screen patterns it
         * allowed. Optional so a record written before pack pins still parses;
         * the current server always writes both for a pack-resolved draft.
         */
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

/**
#223: the advisory review a teacher may request after a draft reaches
`ready-for-review`. It is separate from the draft diagnostics on purpose: the
reviewer runs outside the generation deadline and may only add warnings, so it
cannot change the record's state, its diagnostics, or its answer keys.
*/
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
    /**
    Every entry is a warning by construction: the stored shape has no verdict
    field, so a reviewer result cannot express a block.
    */
    findings: z.array(advisoryReviewFindingSchema),
  })
  .strict();

/**
The advisory reviewer's failure classes. A failure is reported to the teacher
and never persisted against the draft.
*/
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
