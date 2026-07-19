import { describe, expect, it } from 'vitest'

import { getDemoSession } from '@/server/demo/policy'
import { createDeterministicLessonDraftProvider } from '@/server/generation/provider'
import { createGenerationService } from '@/server/generation/service'
import { readServerConfig } from '@/server/config'
import { createFoundationPersistence } from '@/server/persistence'

import { handleLessonPreviewRequest } from './preview.server'

describe('teacher lesson preview delivery seam', () => {
  it('rejects an unsupported catalog before reading the draft', async () => {
    const response = await handleLessonPreviewRequest(
      new Request(
        'http://localhost/api/a2ui/preview?role=teacher&requestId=draft_req_test&catalogVersion=old-v1',
      ),
    )

    expect(response.status).toBe(406)
    await expect(response.json()).resolves.toMatchObject({
      code: 'UNSUPPORTED_CATALOG',
    })
  })

  it('streams a persisted ready-for-review draft as twelve A2UI messages', async () => {
    const config = readServerConfig()
    const persistence = createFoundationPersistence(config)
    const result = await createGenerationService({
      persistence,
      provider: createDeterministicLessonDraftProvider(),
    }).generate({
      session: getDemoSession('teacher'),
      input: {
        prompt: 'equivalent fractions for grade 4',
        grade: '4',
        standardId: 'standard_ccss_4_nf_a_01',
        language: 'en',
        difficulty: 'on-level',
        idempotencyKey: `preview-route-test-${crypto.randomUUID()}`,
      },
    })

    const response = await handleLessonPreviewRequest(
      new Request(
        `http://localhost/api/a2ui/preview?role=teacher&requestId=${encodeURIComponent(result.record.requestId)}`,
      ),
    )
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(body.match(/event: a2ui/g)).toHaveLength(12)
    expect(body).toContain('"surfaceCount":4')
    expect(body).toContain('"component":"LearningPath"')
    expect(body).toContain('"graphVersion":"equivalent-fractions-v1"')
    expect(body).toContain('"modelVersion":"equivalent-fractions-fixture-v1"')
    expect(body).not.toContain('answerKey')
    expect(body).not.toContain('relationship-')
    expect(body).not.toContain('provenance')
  })
})
