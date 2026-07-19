import { z } from 'zod'

import {
  difficultyValues,
  generationStateValues,
  languageValues,
  publicGenerationDiagnosticSchema,
} from '@/shared/generation-contract'

import type {
  GenerationAttemptRecord,
  GenerationDiagnostic,
  LessonDraft,
  LessonGenerationRecord,
} from '../generation/types'
import type {
  NormalizedGenerationRequest,
  ProviderProvenance,
} from '../generation/provider'
import {
  providerDraftSchema,
  validatedLearningPathSchema,
} from '../generation/validation'

const normalizedGenerationRequestSchema: z.ZodType<NormalizedGenerationRequest> =
  z.object({
    prompt: z.string(),
    grade: z.number().int().min(3).max(6),
    standardId: z.string(),
    language: z.enum(languageValues),
    difficulty: z.enum(difficultyValues),
  })

const provenanceSchema: z.ZodType<ProviderProvenance> = z
  .object({
    provider: z.string(),
    model: z.string(),
    promptTemplateVersion: z.string(),
    validatorVersion: z.string(),
    catalogVersion: z.string().optional(),
  })
  .strict()

const lessonDraftSchema: z.ZodType<LessonDraft> = providerDraftSchema
  .extend({
    learningPath: validatedLearningPathSchema,
    requestId: z.string(),
    input: normalizedGenerationRequestSchema,
    provenance: provenanceSchema,
    createdAt: z.string(),
  })
  .strict()

const diagnosticsSchema = publicGenerationDiagnosticSchema.array()
const stateSchema = z.enum(generationStateValues)

export interface StoredGenerationRequestRow {
  requestId: string
  tenantId: string
  teacherId: string
  prompt: string
  grade: number
  standardId: string
  language: string
  difficulty: string
  state: string
  attempt: number
  diagnostics: unknown
  draft: unknown
  provenance: unknown
  createdAt: string | Date
  updatedAt: string | Date
}

export interface StoredGenerationAttemptRow {
  attemptNumber: number
  idempotencyKey: string
  state: string
  correctionAttempted: boolean
  diagnostics: unknown
  provenance: unknown
  createdAt: string | Date
}

function decodeJson(value: unknown, field: string): unknown {
  if (typeof value !== 'string') return value

  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error(`Stored ${field} contains invalid JSON.`)
  }
}

function parseStoredJson<T>(
  value: unknown,
  schema: z.ZodType<T>,
  field: string,
): T | undefined {
  if (value === null || value === undefined) return undefined

  const parsed = schema.safeParse(decodeJson(value, field))
  if (!parsed.success) {
    throw new Error(`Stored ${field} does not match its contract.`)
  }

  return parsed.data
}

function timestamp(value: string | Date, field: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Stored ${field} is not a valid timestamp.`)
  }
  return parsed.toISOString()
}

export function hydrateGenerationRecord(
  row: StoredGenerationRequestRow,
  attempts: StoredGenerationAttemptRow[],
): LessonGenerationRecord {
  const diagnostics =
    parseStoredJson<GenerationDiagnostic[]>(
      row.diagnostics,
      diagnosticsSchema,
      'request diagnostics',
    ) ?? []
  const draft = parseStoredJson<LessonDraft>(
    row.draft,
    lessonDraftSchema,
    'lesson draft',
  )
  const provenance = parseStoredJson<ProviderProvenance>(
    row.provenance,
    provenanceSchema,
    'request provenance',
  )
  const input = normalizedGenerationRequestSchema.parse({
    prompt: row.prompt,
    grade: row.grade,
    standardId: row.standardId,
    language: row.language,
    difficulty: row.difficulty,
  })
  const state = stateSchema.parse(row.state)

  return {
    requestId: row.requestId,
    tenantId: row.tenantId,
    teacherId: row.teacherId,
    input,
    state,
    attempt: row.attempt,
    diagnostics,
    ...(draft ? { draft } : {}),
    ...(provenance ? { provenance } : {}),
    attempts: attempts.map<GenerationAttemptRecord>((attempt) => {
      const attemptProvenance = parseStoredJson<ProviderProvenance>(
        attempt.provenance,
        provenanceSchema,
        'attempt provenance',
      )

      return {
        attemptNumber: attempt.attemptNumber,
        idempotencyKey: attempt.idempotencyKey,
        state: stateSchema.parse(attempt.state),
        correctionAttempted: attempt.correctionAttempted,
        diagnostics:
          parseStoredJson<GenerationDiagnostic[]>(
            attempt.diagnostics,
            diagnosticsSchema,
            'attempt diagnostics',
          ) ?? [],
        ...(attemptProvenance ? { provenance: attemptProvenance } : {}),
        createdAt: timestamp(attempt.createdAt, 'attempt created_at'),
      }
    }),
    createdAt: timestamp(row.createdAt, 'request created_at'),
    updatedAt: timestamp(row.updatedAt, 'request updated_at'),
  }
}
