import { describe, expect, it } from 'vitest'

import { createServerObservability } from './observability.server'
import { readDemoSnapshot } from './demo/read-model'
import { assertSeedIntegrity, demoSeed, getDemoSeedCounts } from './seed-data'

describe('synthetic seed', () => {
  it('has stable unique identifiers and expected fixture counts', () => {
    expect(() => assertSeedIntegrity()).not.toThrow()
    expect(getDemoSeedCounts()).toEqual({
      tenants: 1,
      identities: 2,
      standards: 1,
      graphNodes: 2,
      graphEdges: 1,
      activities: 1,
      activityVersions: 1,
      attempts: 1,
    })
  })

  it('does not expose the private answer key through the public snapshot', async () => {
    const snapshot = await readDemoSnapshot('student', {})

    expect(JSON.stringify(snapshot)).not.toContain('answerKey')
    expect(JSON.stringify(snapshot)).not.toContain(
      JSON.stringify(demoSeed.activityVersion.answerKey),
    )
  })

  it('observes demo snapshot configuration failures', async () => {
    const events: unknown[] = []
    const observability = createServerObservability({
      logger: (event) => events.push(event),
      sentry: null,
    })

    await expect(
      readDemoSnapshot(
        'student',
        {
          APP_ENV: 'production',
          DEMO_MODE: 'false',
          DATABASE_URL: 'not-a-url',
          OPENAI_API_KEY: 'test-server-key',
        },
        { observability },
      ),
    ).rejects.toThrow('Demo environment configuration is invalid.')

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      operation: 'demo.snapshot',
      context: {
        reason: 'invalid_configuration',
        issueCodes: ['INVALID_DATABASE_URL'],
      },
    })
  })
})
