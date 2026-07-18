import { describe, expect, it } from 'vitest'

import { createEquivalentFractionsDraft } from '@/server/generation/provider'

import { compileLessonPreview } from './compiler'
import { createPreviewSSEStream } from './stream'

describe('lesson preview SSE delivery', () => {
  it('frames every A2UI message and closes with a completion event', async () => {
    const preview = compileLessonPreview({
      requestId: 'draft_req_stream_test',
      grade: 4,
      standardId: 'standard_ccss_4_nf_a_01',
      language: 'en',
      draft: createEquivalentFractionsDraft({
        prompt: 'equivalent fractions for grade 4',
        grade: 4,
        standardId: 'standard_ccss_4_nf_a_01',
        language: 'en',
        difficulty: 'on-level',
      }),
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
