import { publicGenerationResultSchema } from '@/shared/generation-contract'
import type { PublicGenerationResult } from '@/shared/generation-contract'

import type { LessonGenerationRecord } from './types'

function publicDraft(record: LessonGenerationRecord) {
  if (!record.draft) return null

  return {
    requestId: record.requestId,
    prompt: record.input.prompt,
    grade: record.input.grade,
    standardId: record.input.standardId,
    language: record.input.language,
    difficulty: record.input.difficulty,
    variants: record.draft.variants.map((variant) => ({
      id: variant.id,
      kind: variant.kind,
      title: variant.title,
      instructions: variant.instructions,
      sourceItems: variant.sourceItems,
      targetItems: variant.targetItems,
      distractorItems: variant.distractorItems,
      hints: variant.hints,
      feedback: variant.feedback,
      languageMetadata: variant.languageMetadata,
      accessibilityMetadata: variant.accessibilityMetadata,
    })),
  }
}

function retryForState(record: LessonGenerationRecord) {
  if (
    record.state === 'failed-retryable' ||
    record.state === 'blocked-by-validation'
  ) {
    return {
      available: true,
      message: 'Review the diagnostics, then try this draft again.',
    }
  }

  if (record.state === 'blocked-by-moderation') {
    return {
      available: false,
      message: 'Revise the request before starting a new draft.',
    }
  }

  return {
    available: false,
    message: 'This generation attempt does not need a retry.',
  }
}

export function toPublicGenerationResult(
  record: LessonGenerationRecord,
): PublicGenerationResult {
  return publicGenerationResultSchema.parse({
    requestId: record.requestId,
    state: record.state,
    attempt: Math.max(record.attempt, 1),
    diagnostics: record.diagnostics,
    draft: publicDraft(record),
    provenance: record.provenance ?? null,
    retry: retryForState(record),
  })
}
