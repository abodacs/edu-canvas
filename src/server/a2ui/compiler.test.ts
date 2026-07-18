import { describe, expect, it } from 'vitest'

import { createEquivalentFractionsDraft } from '@/server/generation/provider'

import { compileLessonPreview, LessonPreviewCompileError } from './compiler'
import { validateA2UIMessage } from '@/shared/a2ui-contract'

const request = {
  requestId: 'draft_req_preview_test',
  grade: 4,
  standardId: 'standard_ccss_4_nf_a_01',
  language: 'en' as const,
  draft: createEquivalentFractionsDraft({
    prompt: 'equivalent fractions for grade 4',
    grade: 4,
    standardId: 'standard_ccss_4_nf_a_01',
    language: 'en',
    difficulty: 'on-level',
  }),
}

describe('lesson preview compiler', () => {
  it('compiles four validated variants into safe v0.9.1 surfaces', () => {
    const preview = compileLessonPreview(request)

    expect(
      preview.messages.filter((message) => 'createSurface' in message),
    ).toHaveLength(4)
    expect(
      preview.messages.filter((message) => 'updateComponents' in message),
    ).toHaveLength(4)
    expect(
      preview.messages.filter((message) => 'updateDataModel' in message),
    ).toHaveLength(4)

    for (const message of preview.messages) {
      expect(validateA2UIMessage(message)).toMatchObject({ ok: true })
    }

    const serialized = JSON.stringify(preview.messages)
    expect(serialized).not.toContain('relationship-')
    expect(serialized).not.toContain('provenance')
    expect(serialized).not.toContain('answerKey')

    const dataModels = preview.messages.flatMap((message) =>
      'updateDataModel' in message ? [message.updateDataModel.value] : [],
    )

    expect(dataModels.map((model) => model.purpose)).toEqual([
      'Teach the model',
      'Independent practice',
      'Guided practice',
      'Review and challenge',
    ])
    expect(new Set(dataModels.map((model) => model.validationState))).toEqual(
      new Set(['ready-for-review']),
    )
  })

  it('blocks executable content before it can enter an A2UI surface', () => {
    const unsafeRequest = structuredClone(request)
    unsafeRequest.draft.variants[0].sourceItems[0].label =
      '<script>alert(1)</script>'

    expect(() => compileLessonPreview(unsafeRequest)).toThrow(
      LessonPreviewCompileError,
    )
  })

  it('blocks duplicate variant identifiers before creating duplicate surfaces', () => {
    const duplicateRequest = structuredClone(request)
    duplicateRequest.draft.variants[1].id =
      duplicateRequest.draft.variants[0].id

    expect(() => compileLessonPreview(duplicateRequest)).toThrow(
      'duplicate variant identifiers',
    )
  })
})
