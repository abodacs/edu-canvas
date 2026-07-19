import { describe, expect, it } from 'vitest'

import { createEquivalentFractionsDraft } from '@/server/generation/provider'
import { buildValidatedLearningPath } from '@/server/generation/learning-path'
import { createDemoCurriculumContext } from '@/server/generation/semantic-validation'

import { compileLessonPreview, LessonPreviewCompileError } from './compiler'
import { validateA2UIMessage } from '@/shared/a2ui-contract'

const baseRequest = {
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

const request = {
  ...baseRequest,
  learningPath: buildValidatedLearningPath({
    proposal: baseRequest.draft.learningPath!,
    context: createDemoCurriculumContext(baseRequest),
    draftId: baseRequest.requestId,
    provenance: {
      provider: 'deterministic-fixture',
      model: 'equivalent-fractions-fixture-v1',
      promptTemplateVersion: 'lesson-prompt-v1',
      validatorVersion: 'lesson-validator-v2',
    },
    validatorVersion: 'semantic-validation-runner-v1',
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

  it('compiles the accepted prerequisite path into every semantic preview surface', () => {
    const preview = compileLessonPreview(request)
    const pathComponents = preview.messages.flatMap((message) =>
      'updateComponents' in message
        ? message.updateComponents.components.filter(
            (component) => component.component === 'LearningPath',
          )
        : [],
    )
    const dataModels = preview.messages.flatMap((message) =>
      'updateDataModel' in message ? [message.updateDataModel.value] : [],
    )

    expect(pathComponents).toHaveLength(4)
    expect(dataModels[0]?.learningPath).toMatchObject({
      direction: 'forward',
      steps: [
        { role: 'prerequisite', nodeId: 'graph_node_equal_parts' },
        {
          role: 'target',
          nodeId: 'graph_node_equivalent_fractions',
        },
      ],
      versionPins: {
        draftId: 'draft_req_preview_test',
        graphVersion: 'equivalent-fractions-v1',
        catalogVersion: 'matching-v1',
        modelVersion: 'equivalent-fractions-fixture-v1',
      },
    })
  })
})
