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
const variantKindValues = ["standard", "scaffold", "challenge"] as const;
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
