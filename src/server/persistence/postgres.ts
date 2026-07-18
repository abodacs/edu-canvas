import postgres from 'postgres'

import type { DemoCounts } from '@/shared/demo-contract'

import type { LessonGenerationRecord } from '../generation/types'
import type { ServerObservability } from '../observability.server'
import { serverObservability } from '../observability.server'
import type { FoundationPersistence } from '../persistence'
import { demoSeed } from '../seed-data'

import { hydrateGenerationRecord } from './generation-codec'
import type {
  StoredGenerationAttemptRow,
  StoredGenerationRequestRow,
} from './generation-codec'
import { createGenerationPersistence } from './generation-persistence'
import type { GenerationPersistenceBackend } from './generation-persistence'

type SqlClient = ReturnType<typeof postgres>
type SqlTransaction = postgres.TransactionSql
type JsonValue = postgres.JSONValue

interface GenerationRequestRow {
  id: string
  tenant_id: string
  teacher_id: string
  prompt: string
  grade: number
  standard_id: string
  language: string
  difficulty: string
  state: string
  attempt: number
  diagnostics: unknown
  draft: unknown
  provenance: unknown
  created_at: string | Date
  updated_at: string | Date
}

interface GenerationAttemptRow {
  attempt_number: number
  idempotency_key: string
  state: string
  correction_attempted: boolean
  diagnostics: unknown
  provenance: unknown
  created_at: string | Date
}

export interface PostgresPersistenceOptions {
  observability?: ServerObservability
}

function createSqlClient(databaseUrl: string): SqlClient {
  return postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 30,
    prepare: false,
  })
}

async function withDatabase<T>(
  databaseUrl: string,
  callback: (sql: SqlClient) => Promise<T>,
): Promise<T> {
  const sql = createSqlClient(databaseUrl)

  try {
    return await callback(sql)
  } finally {
    await sql.end({ timeout: 3 })
  }
}

function jsonValue(value: unknown): JsonValue {
  if (value === null) return null

  switch (typeof value) {
    case 'boolean':
    case 'string':
      return value
    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error('Cannot encode a non-finite JSON number.')
      }
      return value
    case 'object':
      if (Array.isArray(value)) return value.map(jsonValue)

      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, jsonValue(child)]),
      )
    default:
      throw new Error('Cannot encode a non-JSON persistence value.')
  }
}

function createPostgresGenerationBackend(
  databaseUrl: string,
): GenerationPersistenceBackend<SqlTransaction> {
  return {
    async withTransaction<T>(
      callback: (transaction: SqlTransaction) => Promise<T>,
    ): Promise<T> {
      return withDatabase(databaseUrl, async (sql) => {
        const result = await sql.begin(callback)
        return result as T
      })
    },

    async withClaimSavepoint(transaction, callback) {
      await transaction`savepoint claim_generation`
      try {
        return await callback(transaction)
      } catch (error) {
        await transaction`rollback to savepoint claim_generation`
        throw error
      }
    },

    async setTenant(transaction, tenantId) {
      await transaction`
        select set_config('app.tenant_id', ${tenantId}, true)
      `
    },

    async insertRequest(transaction, record) {
      await transaction`
        insert into lesson_draft_requests (
          id,
          tenant_id,
          teacher_id,
          prompt,
          grade,
          standard_id,
          language,
          difficulty,
          state,
          attempt,
          diagnostics,
          draft,
          provenance,
          created_at,
          updated_at
        )
        values (
          ${record.requestId},
          ${record.tenantId},
          ${record.teacherId},
          ${record.input.prompt},
          ${record.input.grade},
          ${record.input.standardId},
          ${record.input.language},
          ${record.input.difficulty},
          ${record.state},
          ${record.attempt},
          ${transaction.json(jsonValue(record.diagnostics))}::jsonb,
          ${transaction.json(jsonValue(record.draft ?? null))}::jsonb,
          ${transaction.json(jsonValue(record.provenance ?? null))}::jsonb,
          ${record.createdAt},
          ${record.updatedAt}
        )
        on conflict (id) do nothing
      `
    },

    async insertAttempt(transaction, record, attempt) {
      const rows = await transaction<{ request_id: string }[]>`
        insert into lesson_generation_attempts (
          request_id,
          tenant_id,
          attempt_number,
          idempotency_key,
          state,
          correction_attempted,
          diagnostics,
          provenance,
          created_at
        )
        values (
          ${record.requestId},
          ${record.tenantId},
          ${attempt.attemptNumber},
          ${attempt.idempotencyKey},
          ${attempt.state},
          ${attempt.correctionAttempted},
          ${transaction.json(jsonValue(attempt.diagnostics))}::jsonb,
          ${transaction.json(jsonValue(attempt.provenance ?? null))}::jsonb,
          ${attempt.createdAt}
        )
        on conflict (tenant_id, idempotency_key) do nothing
        returning request_id
      `
      return rows.map(({ request_id: requestId }) => ({ requestId }))
    },

    async updateRequest(transaction, record) {
      await transaction`
        update lesson_draft_requests
        set
          state = ${record.state},
          attempt = ${record.attempt},
          diagnostics = ${transaction.json(jsonValue(record.diagnostics))}::jsonb,
          draft = ${transaction.json(jsonValue(record.draft ?? null))}::jsonb,
          provenance = ${transaction.json(jsonValue(record.provenance ?? null))}::jsonb,
          updated_at = ${record.updatedAt}
        where tenant_id = ${record.tenantId} and id = ${record.requestId}
      `
    },

    async findClaimConflict(transaction, record, attempt) {
      const rows = await transaction<{ request_id: string }[]>`
        select request_id
        from lesson_generation_attempts
        where tenant_id = ${record.tenantId}
          and (
            idempotency_key = ${attempt.idempotencyKey}
            or (
              request_id = ${record.requestId}
              and attempt_number = ${attempt.attemptNumber}
            )
          )
        limit 1
      `
      return rows.map(({ request_id: requestId }) => ({ requestId }))
    },

    async expireRequest(
      transaction,
      tenantId,
      requestId,
      expectedUpdatedAt,
      updatedAt,
      diagnostics,
    ) {
      const rows = await transaction<{ attempt: number }[]>`
        update lesson_draft_requests
        set
          state = 'failed-retryable',
          diagnostics = diagnostics || ${transaction.json(jsonValue(diagnostics))}::jsonb,
          updated_at = ${updatedAt}
        where tenant_id = ${tenantId}
          and id = ${requestId}
          and state = 'generating'
          and updated_at = ${expectedUpdatedAt}
        returning attempt
      `
      return rows[0]
    },

    async expireAttempt(
      transaction,
      tenantId,
      requestId,
      attemptNumber,
      diagnostics,
    ) {
      const rows = await transaction<{ request_id: string }[]>`
        update lesson_generation_attempts
        set
          state = 'failed-retryable',
          diagnostics = diagnostics || ${transaction.json(jsonValue(diagnostics))}::jsonb
        where tenant_id = ${tenantId}
          and request_id = ${requestId}
          and attempt_number = ${attemptNumber}
        returning request_id
      `
      return rows.length > 0
    },

    async updateRequestWithExpectation(transaction, record, expected) {
      const rows = await transaction<{ id: string }[]>`
        update lesson_draft_requests
        set
          state = ${record.state},
          attempt = ${record.attempt},
          diagnostics = ${transaction.json(jsonValue(record.diagnostics))}::jsonb,
          draft = ${transaction.json(jsonValue(record.draft ?? null))}::jsonb,
          provenance = ${transaction.json(jsonValue(record.provenance ?? null))}::jsonb,
          updated_at = ${record.updatedAt}
        where tenant_id = ${record.tenantId}
          and id = ${record.requestId}
          and state = 'generating'
          and attempt = ${expected.attempt}
          and updated_at = ${expected.updatedAt}
        returning id
      `
      return rows.length > 0
    },

    async upsertAttempt(transaction, record, attempt) {
      await transaction`
        insert into lesson_generation_attempts (
          request_id,
          tenant_id,
          attempt_number,
          idempotency_key,
          state,
          correction_attempted,
          diagnostics,
          provenance,
          created_at
        )
        values (
          ${record.requestId},
          ${record.tenantId},
          ${attempt.attemptNumber},
          ${attempt.idempotencyKey},
          ${attempt.state},
          ${attempt.correctionAttempted},
          ${transaction.json(jsonValue(attempt.diagnostics))}::jsonb,
          ${transaction.json(jsonValue(attempt.provenance ?? null))}::jsonb,
          ${attempt.createdAt}
        )
        on conflict (request_id, attempt_number) do update set
          state = excluded.state,
          correction_attempted = excluded.correction_attempted,
          diagnostics = excluded.diagnostics,
          provenance = excluded.provenance
      `
    },

    findGenerationByIdempotencyKey(tenantId, idempotencyKey) {
      return readGenerationByQuery(databaseUrl, tenantId, idempotencyKey)
    },

    readGeneration(tenantId, requestId) {
      return readGenerationByQuery(databaseUrl, tenantId, requestId, true)
    },
  }
}

export function createPostgresPersistence(
  databaseUrl: string,
  options: PostgresPersistenceOptions = {},
): FoundationPersistence {
  const observability = options.observability ?? serverObservability
  const generationPersistence = createGenerationPersistence(
    createPostgresGenerationBackend(databaseUrl),
  )

  return {
    kind: 'postgres',
    ...generationPersistence,

    async check() {
      try {
        await withDatabase(databaseUrl, async (sql) => {
          await sql`select 1 as ok`
        })

        return {
          status: 'ready',
          kind: 'postgres',
          code: 'READY',
          message: 'PostgreSQL responded to the bounded readiness query.',
        }
      } catch (error) {
        observability.captureError(error, {
          operation: 'persistence.readiness',
          dependency: 'postgres',
          reason: 'persistence_unavailable',
          code: 'PERSISTENCE_UNAVAILABLE',
        })

        return {
          status: 'failed',
          kind: 'postgres',
          code: 'PERSISTENCE_UNAVAILABLE',
          message: 'PostgreSQL did not respond within the readiness timeout.',
        }
      }
    },

    async readDemoCounts(): Promise<DemoCounts> {
      try {
        const rows = await withDatabase(databaseUrl, async (sql) => {
          return sql.begin(async (transaction) => {
            await transaction`
              select set_config('app.tenant_id', ${demoSeed.tenant.id}, true)
            `

            return transaction`
              select
                (select count(*)::int from tenants where id = ${demoSeed.tenant.id}) as tenants,
                (select count(*)::int from identities where tenant_id = ${demoSeed.tenant.id}) as identities,
                (select count(*)::int from standards where tenant_id = ${demoSeed.tenant.id}) as standards,
                (select count(*)::int from prerequisite_nodes where tenant_id = ${demoSeed.tenant.id}) as "graphNodes",
                (select count(*)::int from prerequisite_edges where tenant_id = ${demoSeed.tenant.id}) as "graphEdges",
                (select count(*)::int from activities where tenant_id = ${demoSeed.tenant.id}) as activities,
                (select count(*)::int from activity_versions where tenant_id = ${demoSeed.tenant.id}) as "activityVersions",
                (select count(*)::int from attempts where tenant_id = ${demoSeed.tenant.id}) as attempts
            `
          })
        })

        const row = rows[0]
        return {
          tenants: Number(row.tenants),
          identities: Number(row.identities),
          standards: Number(row.standards),
          graphNodes: Number(row.graphNodes),
          graphEdges: Number(row.graphEdges),
          activities: Number(row.activities),
          activityVersions: Number(row.activityVersions),
          attempts: Number(row.attempts),
        }
      } catch (error) {
        observability.captureError(error, {
          operation: 'persistence.read-demo-counts',
          dependency: 'postgres',
          reason: 'persistence_read_failed',
          code: 'PERSISTENCE_UNAVAILABLE',
        })
        throw error
      }
    },
  }
}

async function readGenerationByQuery(
  databaseUrl: string,
  tenantId: string,
  value: string,
  byRequestId = false,
): Promise<LessonGenerationRecord | undefined> {
  return withDatabase(databaseUrl, async (sql) => {
    return sql.begin(async (transaction) => {
      await transaction`
        select set_config('app.tenant_id', ${tenantId}, true)
      `

      const rows = byRequestId
        ? await transaction<GenerationRequestRow[]>`
            select *
            from lesson_draft_requests
            where tenant_id = ${tenantId} and id = ${value}
            limit 1
          `
        : await transaction<GenerationRequestRow[]>`
            select request.*
            from lesson_draft_requests request
            join lesson_generation_attempts attempt
              on attempt.request_id = request.id
             and attempt.tenant_id = request.tenant_id
            where request.tenant_id = ${tenantId}
              and attempt.idempotency_key = ${value}
            limit 1
          `

      if (rows.length === 0) return undefined
      const row = rows[0]

      const attempts = await transaction<GenerationAttemptRow[]>`
        select
          attempt_number,
          idempotency_key,
          state,
          correction_attempted,
          diagnostics,
          provenance,
          created_at
        from lesson_generation_attempts
        where tenant_id = ${tenantId} and request_id = ${row.id}
        order by attempt_number asc
      `

      const storedRequest: StoredGenerationRequestRow = {
        requestId: row.id,
        tenantId: row.tenant_id,
        teacherId: row.teacher_id,
        prompt: row.prompt,
        grade: row.grade,
        standardId: row.standard_id,
        language: row.language,
        difficulty: row.difficulty,
        state: row.state,
        attempt: row.attempt,
        diagnostics: row.diagnostics,
        draft: row.draft,
        provenance: row.provenance,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
      const storedAttempts: StoredGenerationAttemptRow[] = attempts.map(
        (attempt) => ({
          attemptNumber: attempt.attempt_number,
          idempotencyKey: attempt.idempotency_key,
          state: attempt.state,
          correctionAttempted: attempt.correction_attempted,
          diagnostics: attempt.diagnostics,
          provenance: attempt.provenance,
          createdAt: attempt.created_at,
        }),
      )

      return hydrateGenerationRecord(storedRequest, storedAttempts)
    })
  })
}
