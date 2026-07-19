import { describe, expect, it } from 'vitest'

import { createEquivalentFractionsDraft } from '@/server/generation/provider'
import { buildValidatedLearningPath } from '@/server/generation/learning-path'
import { createDemoCurriculumContext } from '@/server/generation/semantic-validation'

import { compileLessonPreview } from './compiler'
import { createPreviewSSEStream } from './stream'

describe('lesson preview SSE delivery', () => {
  it('frames every A2UI message and closes with a completion event', async () => {
    const draft = createEquivalentFractionsDraft({
      prompt: 'equivalent fractions for grade 4',
      grade: 4,
      standardId: 'standard_ccss_4_nf_a_01',
      language: 'en',
      difficulty: 'on-level',
    })
    const learningPath = buildValidatedLearningPath({
      proposal: draft.learningPath!,
      context: createDemoCurriculumContext({
        grade: 4,
        standardId: 'standard_ccss_4_nf_a_01',
        language: 'en',
      }),
      draftId: 'draft_req_stream_test',
      provenance: {
        provider: 'deterministic-fixture',
        model: 'equivalent-fractions-fixture-v1',
        promptTemplateVersion: 'lesson-prompt-v1',
        validatorVersion: 'lesson-validator-v2',
      },
      validatorVersion: 'semantic-validation-runner-v1',
    })
    const preview = compileLessonPreview({
      requestId: 'draft_req_stream_test',
      grade: 4,
      standardId: 'standard_ccss_4_nf_a_01',
      language: 'en',
      draft,
      learningPath,
    })

    const body = await new Response(
      createPreviewSSEStream(preview.messages),
    ).text()

    expect(body.match(/event: a2ui/g)).toHaveLength(12)
    expect(body).toContain('event: complete')
    expect(body).toContain('"surfaceCount":4')
    expect(body).toMatch(/content-type|event:/)
  })
})
