import { describe, expect, it, vi } from 'vitest'

import { createServerObservability } from '../observability.server'
import type { LessonGenerationRecord } from '../generation/types'

import { createPostgresPersistence } from './postgres'

const postgresMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error(
      'database connection failed for student identity_demo_student',
    )
  }),
)

vi.mock('postgres', () => ({ default: postgresMock }))

describe('PostgreSQL persistence', () => {
  it('reports an unavailable database through server observability', async () => {
    const events: unknown[] = []
    const observability = createServerObservability({
      logger: (event) => events.push(event),
      sentry: null,
    })

    const result = await createPostgresPersistence(
      'postgresql://user:password@db.example/app',
      { observability },
    ).check()

    expect(result).toMatchObject({
      status: 'failed',
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

  it('claims a generation before provider work through the persistence seam', async () => {
    const record: LessonGenerationRecord = {
      requestId: 'draft_req_claimed',
      tenantId: 'tenant_demo',
      teacherId: 'identity_demo_teacher',
      input: {
        prompt: 'Equivalent fractions',
        grade: 4,
        standardId: 'standard_equivalent_fractions',
        language: 'en',
        difficulty: 'on-level',
      },
      state: 'generating',
      attempt: 1,
      diagnostics: [],
      attempts: [
        {
          attemptNumber: 1,
          idempotencyKey: 'request-claim-test',
          state: 'generating',
          correctionAttempted: false,
          diagnostics: [],
          createdAt: '2026-07-18T00:00:00.000Z',
        },
      ],
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    }
    const statements: string[] = []
    const transaction = vi.fn((strings: TemplateStringsArray) => {
      const statement = strings.join(' ')
      statements.push(statement)
      return statement.includes('insert into lesson_generation_attempts')
        ? [{ request_id: record.requestId }]
        : []
    })
    const begin = vi.fn((callback: (query: typeof transaction) => unknown) =>
      callback(transaction),
    )
    const end = vi.fn(async () => undefined)
    const sqlClient = Object.assign(vi.fn(), { begin, end })
    postgresMock.mockImplementationOnce(() => sqlClient as never)

    const result = await createPostgresPersistence(
      'postgresql://user:password@db.example/app',
    ).claimGeneration(record)

    expect(result).toEqual({ claimed: true, record })
    expect(
      statements.some((statement) =>
        statement.includes('savepoint claim_generation'),
      ),
    ).toBe(true)
    expect(
      statements.some((statement) =>
        statement.includes('update lesson_draft_requests'),
      ),
    ).toBe(true)
    expect(end).toHaveBeenCalledWith({ timeout: 3 })
  })
})
