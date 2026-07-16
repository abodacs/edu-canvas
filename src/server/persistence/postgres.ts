import postgres from 'postgres'

import type { DemoCounts } from '@/shared/demo-contract'

import { serverObservability } from '../observability.server'
import type { ServerObservability } from '../observability.server'
import type { FoundationPersistence } from '../persistence'
import type {
  GenerationAttemptRecord,
  LessonGenerationRecord,
} from '../generation/types'
import { demoSeed } from '../seed-data'

type SqlClient = ReturnType<typeof postgres>

export interface PostgresPersistenceOptions {
  observability?: ServerObservability
}

interface GenerationRequestRow {
  id: string
  tenant_id: string
  teacher_id: string
  prompt: string
  grade: number
  standard_id: string
  language: 'en' | 'ar'
  difficulty: 'support' | 'on-level' | 'stretch'
  state: LessonGenerationRecord['state']
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
  state: LessonGenerationRecord['state']
  correction_attempted: boolean
  diagnostics: unknown
  provenance: unknown
  created_at: string | Date
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
) {
  const sql = createSqlClient(databaseUrl)

  try {
    return await callback(sql)
  } finally {
    await sql.end({ timeout: 3 })
  }
}

function parseJson<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return JSON.parse(value) as T
  return value as T
}

function timestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function hydrateGenerationRecord(
  row: GenerationRequestRow,
  attempts: GenerationAttemptRow[],
): LessonGenerationRecord {
  return {
    requestId: row.id,
    tenantId: row.tenant_id,
    teacherId: row.teacher_id,
    input: {
      prompt: row.prompt,
      grade: row.grade,
      standardId: row.standard_id,
      language: row.language,
      difficulty: row.difficulty,
    },
    state: row.state,
    attempt: row.attempt,
    diagnostics:
      parseJson<LessonGenerationRecord['diagnostics']>(row.diagnostics) ?? [],
    ...(parseJson<LessonGenerationRecord['draft']>(row.draft)
      ? { draft: parseJson<LessonGenerationRecord['draft']>(row.draft) }
      : {}),
    ...(parseJson<LessonGenerationRecord['provenance']>(row.provenance)
      ? {
          provenance: parseJson<LessonGenerationRecord['provenance']>(
            row.provenance,
          ),
        }
      : {}),
    attempts: attempts.map<GenerationAttemptRecord>((attempt) => ({
      attemptNumber: attempt.attempt_number,
      idempotencyKey: attempt.idempotency_key,
      state: attempt.state,
      correctionAttempted: attempt.correction_attempted,
      diagnostics:
        parseJson<GenerationAttemptRecord['diagnostics']>(
          attempt.diagnostics,
        ) ?? [],
      ...(parseJson<GenerationAttemptRecord['provenance']>(attempt.provenance)
        ? {
            provenance: parseJson<GenerationAttemptRecord['provenance']>(
              attempt.provenance,
            ),
          }
        : {}),
      createdAt: timestamp(attempt.created_at),
    })),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  }
}

export function createPostgresPersistence(
  databaseUrl: string,
  options: PostgresPersistenceOptions = {},
): FoundationPersistence {
  const observability = options.observability ?? serverObservability

  return {
    kind: 'postgres',

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
            await transaction`select set_config('app.tenant_id', ${demoSeed.tenant.id}, true)`

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

    async saveGeneration(record) {
      await withDatabase(databaseUrl, async (sql) => {
        await sql.begin(async (transaction) => {
          await transaction`select set_config('app.tenant_id', ${record.tenantId}, true)`
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
              ${JSON.stringify(record.diagnostics)}::jsonb,
              ${JSON.stringify(record.draft ?? null)}::jsonb,
              ${JSON.stringify(record.provenance ?? null)}::jsonb,
              ${record.createdAt},
              ${record.updatedAt}
            )
            on conflict (id) do update set
              state = excluded.state,
              attempt = excluded.attempt,
              diagnostics = excluded.diagnostics,
              draft = excluded.draft,
              provenance = excluded.provenance,
              updated_at = excluded.updated_at
          `

          for (const attempt of record.attempts) {
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
                ${JSON.stringify(attempt.diagnostics)}::jsonb,
                ${JSON.stringify(attempt.provenance ?? null)}::jsonb,
                ${attempt.createdAt}
              )
              on conflict (request_id, attempt_number) do update set
                state = excluded.state,
                correction_attempted = excluded.correction_attempted,
                diagnostics = excluded.diagnostics,
                provenance = excluded.provenance
            `
          }
        })
      })
    },

    async findGenerationByIdempotencyKey(tenantId, idempotencyKey) {
      return readGenerationByQuery(databaseUrl, tenantId, idempotencyKey)
    },

    async readGeneration(tenantId, requestId) {
      return readGenerationByQuery(databaseUrl, tenantId, requestId, true)
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
      await transaction`select set_config('app.tenant_id', ${tenantId}, true)`

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

      return hydrateGenerationRecord(row, attempts)
    })
  })
}
