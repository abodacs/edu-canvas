import { describe, expect, it, vi } from 'vitest'

import { createServerObservability } from '../observability.server'

import { createDrizzlePersistence } from './drizzle'

const postgresMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error(
      'database connection failed for student identity_demo_student',
    )
  }),
)

vi.mock('postgres', () => ({ default: postgresMock }))

describe('Drizzle PostgreSQL persistence', () => {
  it('reports an unavailable database through server observability', async () => {
    const events: unknown[] = []
    const observability = createServerObservability({
      logger: (event) => events.push(event),
      sentry: null,
    })

    const result = await createDrizzlePersistence(
      'postgresql://user:password@db.example/app',
      { observability },
    ).check()

    expect(result).toMatchObject({
      status: 'failed',
      kind: 'postgres',
      code: 'PERSISTENCE_UNAVAILABLE',
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      operation: 'persistence.readiness',
      context: {
        dependency: 'postgres',
      },
    })
    expect(JSON.stringify(events)).not.toContain('identity_demo_student')
  })
})
