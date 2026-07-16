import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createServerObservability } from './observability.server'

const sentryScope = {
  clear: vi.fn(),
  setContext: vi.fn(),
  setTag: vi.fn(),
}

const sentrySdk = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
  withIsolationScope: vi.fn((callback: (scope: typeof sentryScope) => void) =>
    callback(sentryScope),
  ),
}))

vi.mock('@sentry/node', () => sentrySdk)

describe('the Sentry observability adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sentrySdk.init.mockImplementation(() => undefined)
  })

  it('uses only the explicitly controlled, scrubbed Sentry path', () => {
    const logs: unknown[] = []
    const observability = createServerObservability({
      env: {
        APP_ENV: 'production',
        SENTRY_DSN: 'https://public@example.ingest.sentry.io/123',
      },
      logger: (event) => logs.push(event),
    })

    expect(sentrySdk.init).not.toHaveBeenCalled()
    observability.captureError(
      new Error('student identity_demo_student failed to load'),
      { safeCode: 'PERSISTENCE_UNAVAILABLE' },
    )

    expect(sentrySdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultIntegrations: false,
        sendDefaultPii: false,
        beforeSend: expect.any(Function),
      }),
    )
    const beforeSend = (
      sentrySdk.init.mock.calls[0]?.[0] as {
        beforeSend: (event: Record<string, unknown>) => Record<string, unknown>
      }
    ).beforeSend
    const scrubbedEvent = beforeSend({
      breadcrumbs: [{ message: 'student identity_demo_student' }],
      contexts: {
        'edu-canvas': { reason: { name: 'Alice Example' } },
        student: { id: 'identity_demo_student' },
      },
      extra: { name: 'Alice Example' },
      request: { data: { email: 'student@example.com' } },
      user: { id: 'identity_demo_student' },
    })
    expect(scrubbedEvent).not.toHaveProperty('user')
    expect(scrubbedEvent).not.toHaveProperty('request')
    expect(scrubbedEvent).not.toHaveProperty('extra')
    expect(scrubbedEvent).not.toHaveProperty('breadcrumbs')
    expect(scrubbedEvent).toMatchObject({
      contexts: {
        'edu-canvas': {
          reason: '[REDACTED]',
        },
      },
    })
    expect(JSON.stringify(scrubbedEvent)).not.toContain('Alice Example')
    expect(JSON.stringify(scrubbedEvent)).not.toContain('identity_demo_student')
    expect(sentrySdk.withIsolationScope).toHaveBeenCalledOnce()
    expect(sentryScope.clear).toHaveBeenCalledOnce()
    expect(sentrySdk.captureException).toHaveBeenCalledOnce()
    expect(sentrySdk.captureException.mock.calls[0]?.[0]).toBeInstanceOf(Error)
    expect(
      (sentrySdk.captureException.mock.calls[0]?.[0] as Error).message,
    ).not.toContain('identity_demo_student')
    expect(logs[0]).toMatchObject({ delivery: 'sentry' })
  })

  it('keeps structured logging when Sentry initialization fails', () => {
    sentrySdk.init.mockImplementationOnce(() => {
      throw new Error('Sentry initialization failed')
    })
    const logs: unknown[] = []
    const observability = createServerObservability({
      env: {
        APP_ENV: 'production',
        SENTRY_DSN: 'https://public@example.ingest.sentry.io/123',
      },
      logger: (event) => logs.push(event),
    })

    const event = observability.captureError(new Error('deliberate failure'))

    expect(event.delivery).toBe('structured-log')
    expect(logs).toHaveLength(1)
  })
})
