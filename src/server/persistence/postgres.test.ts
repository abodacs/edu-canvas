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
    const transaction = Object.assign(
      vi.fn((strings: TemplateStringsArray) => {
        const statement = strings.join(' ')
        statements.push(statement)
        return statement.includes('insert into lesson_generation_attempts')
          ? [{ request_id: record.requestId }]
          : []
      }),
      { json: vi.fn((value: unknown) => JSON.stringify(value)) },
    )
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
    expect(
      statements.some((statement) =>
        statement.includes(
          'on conflict (tenant_id, idempotency_key) do nothing',
        ),
      ),
    ).toBe(true)
    expect(end).toHaveBeenCalledWith({ timeout: 3 })
  })

  it('returns the winning request when a duplicate claim conflicts', async () => {
    const record: LessonGenerationRecord = {
      requestId: 'draft_req_duplicate',
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
      provenance: {
        provider: 'deterministic-fixture',
        model: 'equivalent-fractions-fixture-v1',
        promptTemplateVersion: 'lesson-prompt-v1',
        validatorVersion: 'lesson-validator-v2',
      },
      attempts: [
        {
          attemptNumber: 1,
          idempotencyKey: 'request-duplicate-test',
          state: 'generating',
          correctionAttempted: false,
          diagnostics: [],
          createdAt: '2026-07-18T00:00:00.000Z',
        },
      ],
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    }
    const claimTransaction = Object.assign(
      vi.fn((strings: TemplateStringsArray) => {
        const statement = strings.join(' ')
        if (statement.includes('insert into lesson_generation_attempts')) {
          return []
        }
        if (statement.includes('select request_id')) {
          return [{ request_id: 'draft_req_winner' }]
        }
        return []
      }),
      { json: vi.fn((value: unknown) => JSON.stringify(value)) },
    )
    const claimClient = Object.assign(vi.fn(), {
      begin: vi.fn((callback: (query: typeof claimTransaction) => unknown) =>
        callback(claimTransaction),
      ),
      end: vi.fn(async () => undefined),
    })
    const winningRow = {
      id: 'draft_req_winner',
      tenant_id: record.tenantId,
      teacher_id: record.teacherId,
      prompt: record.input.prompt,
      grade: record.input.grade,
      standard_id: record.input.standardId,
      language: record.input.language,
      difficulty: record.input.difficulty,
      state: 'ready-for-review' as const,
      attempt: 1,
      diagnostics: [],
      draft: null,
      provenance: record.provenance,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    }
    const readTransaction = vi.fn((strings: TemplateStringsArray) => {
      const statement = strings.join(' ')
      if (statement.includes('from lesson_draft_requests')) {
        return [winningRow]
      }
      if (statement.includes('from lesson_generation_attempts')) {
        return [
          {
            attempt_number: 1,
            idempotency_key: 'request-duplicate-test',
            state: 'ready-for-review' as const,
            correction_attempted: false,
            diagnostics: [],
            provenance: record.provenance,
            created_at: record.createdAt,
          },
        ]
      }
      return []
    })
    const readClient = Object.assign(vi.fn(), {
      begin: vi.fn((callback: (query: typeof readTransaction) => unknown) =>
        callback(readTransaction),
      ),
      end: vi.fn(async () => undefined),
    })
    postgresMock
      .mockImplementationOnce(() => claimClient as never)
      .mockImplementationOnce(() => readClient as never)

    const result = await createPostgresPersistence(
      'postgresql://user:password@db.example/app',
    ).claimGeneration(record)

    expect(result.claimed).toBe(false)
    expect(result.record.requestId).toBe('draft_req_winner')
    expect(result.record.attempts[0]?.state).toBe('ready-for-review')
  })

  it('expires the request and its attempt history in one transaction', async () => {
    const record: LessonGenerationRecord = {
      requestId: 'draft_req_expire_atomic',
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
      provenance: {
        provider: 'deterministic-fixture',
        model: 'equivalent-fractions-fixture-v1',
        promptTemplateVersion: 'lesson-prompt-v1',
        validatorVersion: 'lesson-validator-v2',
      },
      attempts: [
        {
          attemptNumber: 1,
          idempotencyKey: 'request-expire-atomic',
          state: 'generating',
          correctionAttempted: false,
          diagnostics: [],
          provenance: {
            provider: 'deterministic-fixture',
            model: 'equivalent-fractions-fixture-v1',
            promptTemplateVersion: 'lesson-prompt-v1',
            validatorVersion: 'lesson-validator-v2',
          },
          createdAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    }
    const expiryStatements: string[] = []
    const expiryTransaction = Object.assign(
      vi.fn((strings: TemplateStringsArray) => {
        const statement = strings.join(' ')
        expiryStatements.push(statement)
        if (statement.includes('update lesson_draft_requests')) {
          return [{ attempt: 1 }]
        }
        if (statement.includes('update lesson_generation_attempts')) {
          return [{ request_id: record.requestId }]
        }
        return []
      }),
      { json: vi.fn((value: unknown) => JSON.stringify(value)) },
    )
    const expiryBegin = vi.fn(
      (callback: (query: typeof expiryTransaction) => unknown) =>
        callback(expiryTransaction),
    )
    const expiryClient = Object.assign(vi.fn(), {
      begin: expiryBegin,
      end: vi.fn(async () => undefined),
    })
    const readRow = {
      id: record.requestId,
      tenant_id: record.tenantId,
      teacher_id: record.teacherId,
      prompt: record.input.prompt,
      grade: record.input.grade,
      standard_id: record.input.standardId,
      language: record.input.language,
      difficulty: record.input.difficulty,
      state: 'failed-retryable' as const,
      attempt: 1,
      diagnostics: [
        {
          severity: 'error',
          code: 'GENERATION_CLAIM_EXPIRED',
          message: 'The previous generation attempt expired.',
        },
      ],
      draft: null,
      provenance: record.provenance,
      created_at: record.createdAt,
      updated_at: '2026-07-18T00:00:00.000Z',
    }
    const readTransaction = vi.fn((strings: TemplateStringsArray) => {
      const statement = strings.join(' ')
      if (statement.includes('from lesson_draft_requests')) {
        return [readRow]
      }
      if (statement.includes('from lesson_generation_attempts')) {
        return [
          {
            attempt_number: 1,
            idempotency_key: 'request-expire-atomic',
            state: 'failed-retryable' as const,
            correction_attempted: false,
            diagnostics: readRow.diagnostics,
            provenance: record.provenance,
            created_at: record.createdAt,
          },
        ]
      }
      return []
    })
    const readClient = Object.assign(vi.fn(), {
      begin: vi.fn((callback: (query: typeof readTransaction) => unknown) =>
        callback(readTransaction),
      ),
      end: vi.fn(async () => undefined),
    })
    postgresMock
      .mockImplementationOnce(() => expiryClient as never)
      .mockImplementationOnce(() => readClient as never)

    const result = await createPostgresPersistence(
      'postgresql://user:password@db.example/app',
    ).expireGenerationClaim(
      record.tenantId,
      record.requestId,
      record.updatedAt,
      '2026-07-18T00:00:00.000Z',
    )

    expect(result?.state).toBe('failed-retryable')
    expect(expiryBegin).toHaveBeenCalledTimes(1)
    expect(
      expiryStatements.some((statement) =>
        statement.includes('update lesson_draft_requests'),
      ),
    ).toBe(true)
    expect(
      expiryStatements.some((statement) =>
        statement.includes('update lesson_generation_attempts'),
      ),
    ).toBe(true)
  })
})
