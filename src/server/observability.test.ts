import { describe, expect, it } from 'vitest'

import { createServerObservability } from './observability.server'

describe('server observability', () => {
  it('logs and reports a scrubbed server error without sensitive values', () => {
    const logs: unknown[] = []
    const sentryEvents: unknown[] = []

    const observability = createServerObservability({
      env: {
        APP_ENV: 'production',
        SENTRY_DSN: 'https://public@example.ingest.sentry.io/123',
      },
      logger: (event) => logs.push(event),
      sentry: {
        captureException: (_error, event) => sentryEvents.push(event),
      },
      now: () => new Date('2026-07-17T10:00:00.000Z'),
    })

    observability.captureError(
      new Error(
        'student identity_demo_student failed to load from postgresql://db.example/app',
      ),
      {
        operation: 'readiness',
        studentId: 'identity_demo_student',
        email: 'student@example.com',
        databaseUrl: 'postgresql://user:password@db.example/app',
        name: 'Alice Example',
        safeCode: 'PERSISTENCE_UNAVAILABLE',
      },
    )

    expect(logs).toHaveLength(1)
    expect(sentryEvents).toHaveLength(1)

    const serialized = JSON.stringify({ logs, sentryEvents })
    expect(serialized).not.toContain('identity_demo_student')
    expect(serialized).not.toContain('student@example.com')
    expect(serialized).not.toContain(
      'postgresql://user:password@db.example/app',
    )
    expect(serialized).not.toContain('postgresql://db.example/app')
    expect(serialized).not.toContain('Alice Example')
    expect(serialized).toContain('PERSISTENCE_UNAVAILABLE')
    expect(logs[0]).toMatchObject({
      schema: 'edu-canvas.server-error.v1',
      operation: 'readiness',
      delivery: 'sentry',
      environment: 'production',
    })
  })

  it('keeps the structured log fallback when the Sentry boundary fails', () => {
    const logs: unknown[] = []
    const observability = createServerObservability({
      logger: (event) => logs.push(event),
      sentry: {
        captureException: () => {
          throw new Error('Sentry is unavailable')
        },
      },
    })

    const event = observability.captureError(new Error('deliberate failure'), {
      operation: 'test.failure',
    })

    expect(event.delivery).toBe('structured-log')
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ delivery: 'structured-log' })
  })

  it('scrubs sensitive keys nested inside an otherwise safe context field', () => {
    const logs: unknown[] = []
    const observability = createServerObservability({
      logger: (event) => logs.push(event),
      sentry: null,
    })

    observability.captureError(new Error('deliberate failure'), {
      reason: { name: 'Alice Example', explanation: 'safe diagnostic' },
    })

    const serialized = JSON.stringify(logs)
    expect(serialized).not.toContain('Alice Example')
    expect(logs[0]).toMatchObject({
      context: {
        reason: '[REDACTED]',
      },
    })
  })
})
