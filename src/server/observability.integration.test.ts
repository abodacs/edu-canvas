import * as Sentry from '@sentry/node'
import { describe, expect, it } from 'vitest'

import { createServerObservability } from './observability.server'

describe('configured Sentry delivery', () => {
  it('initializes and captures through the installed Sentry SDK', async () => {
    const logs: unknown[] = []
    const observability = createServerObservability({
      env: {
        APP_ENV: 'preview',
        SENTRY_DSN: 'https://public@example.invalid/123',
      },
      logger: (event) => logs.push(event),
    })

    const event = observability.captureError(
      new Error('student identity_demo_student failed to load'),
      { safeCode: 'PERSISTENCE_UNAVAILABLE' },
    )

    expect(event.delivery).toBe('sentry')
    expect(JSON.stringify(logs)).not.toContain('identity_demo_student')

    await Sentry.close(0)
  })
})
