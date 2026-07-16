import { z } from 'zod'

const gradeValues = [3, 4, 5, 6] as const
const gradeTextValues = ['3', '4', '5', '6'] as const
const difficultyValues = ['support', 'on-level', 'stretch'] as const
const languageValues = ['en', 'ar'] as const
const variantKindValues = ['standard', 'scaffold', 'challenge'] as const
const generationStateValues = [
  'requested',
  'generating',
  'ready-for-review',
  'blocked-by-validation',
  'blocked-by-moderation',
  'failed-retryable',
  'failed-terminal',
] as const

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
  })
  .strict()

export type LessonGenerationInput = z.infer<typeof lessonGenerationInputSchema>
export type LessonLanguage = (typeof languageValues)[number]
export type LessonDifficulty = (typeof difficultyValues)[number]
export type PublicVariantKind = (typeof variantKindValues)[number]
export type GenerationState = (typeof generationStateValues)[number]

const publicItemSchema = z
  .object({
    id: z.string(),
    label: z.string(),
  })
  .strict()

const publicVariantSchema = z
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
        direction: z.enum(['ltr', 'rtl']),
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
  .strict()

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
  .strict()

export const publicGenerationDiagnosticSchema = z
  .object({
    severity: z.enum(['warning', 'error']),
    code: z.string(),
    message: z.string(),
    variantId: z.string().optional(),
    field: z.string().optional(),
  })
  .strict()

export const publicGenerationResultSchema = z
  .object({
    requestId: z.string(),
    state: z.enum(generationStateValues),
    attempt: z.number().int().min(1),
    diagnostics: z.array(publicGenerationDiagnosticSchema),
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
  .strict()

export type PublicLessonDraft = z.infer<typeof publicLessonDraftSchema>
export type PublicGenerationDiagnostic = z.infer<
  typeof publicGenerationDiagnosticSchema
>
export type PublicGenerationResult = z.infer<
  typeof publicGenerationResultSchema
>
