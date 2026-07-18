import { and, asc, eq, or, sql } from 'drizzle-orm'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import type {
  PostgresJsDatabase,
  PostgresJsTransaction,
} from 'drizzle-orm/postgres-js'
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

import * as schema from '../../../drizzle/schema'

type DrizzleDatabase = PostgresJsDatabase<typeof schema>
type DrizzleTransaction = PostgresJsTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>
interface DemoCountRow {
  [key: string]: number | string
  tenants: number | string
  identities: number | string
  standards: number | string
  graphNodes: number | string
  graphEdges: number | string
  activities: number | string
  activityVersions: number | string
  attempts: number | string
}

export interface DrizzlePersistenceOptions {
  observability?: ServerObservability
}

function createSqlClient(databaseUrl: string) {
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
  callback: (database: DrizzleDatabase) => Promise<T>,
): Promise<T> {
  const client = createSqlClient(databaseUrl)
  const database = drizzle({ client, schema })

  try {
    return await callback(database)
  } finally {
    await client.end({ timeout: 3 })
  }
}

function generationRequestValues(record: LessonGenerationRecord) {
  return {
    id: record.requestId,
    tenantId: record.tenantId,
    teacherId: record.teacherId,
    prompt: record.input.prompt,
    grade: record.input.grade,
    standardId: record.input.standardId,
    language: record.input.language,
    difficulty: record.input.difficulty,
    state: record.state,
    attempt: record.attempt,
    diagnostics: record.diagnostics,
    draft: record.draft ?? null,
    provenance: record.provenance ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function generationMutableValues(record: LessonGenerationRecord) {
  return {
    state: record.state,
    attempt: record.attempt,
    diagnostics: record.diagnostics,
    draft: record.draft ?? null,
    provenance: record.provenance ?? null,
    updatedAt: record.updatedAt,
  }
}

function createDrizzleGenerationBackend(
  databaseUrl: string,
): GenerationPersistenceBackend<DrizzleTransaction> {
  return {
    async withTransaction<T>(
      callback: (transaction: DrizzleTransaction) => Promise<T>,
    ): Promise<T> {
      return withDatabase(databaseUrl, async (database) => {
        const result = await database.transaction(callback)
        return result
      })
    },

    withClaimSavepoint(transaction, callback) {
      return transaction.transaction(callback)
    },

    async setTenant(transaction, tenantId) {
      await transaction.execute(
        sql`select set_config('app.tenant_id', ${tenantId}, true)`,
      )
    },

    async insertRequest(transaction, record) {
      await transaction
        .insert(schema.lessonDraftRequests)
        .values(generationRequestValues(record))
        .onConflictDoNothing({ target: schema.lessonDraftRequests.id })
    },

    insertAttempt(transaction, record, attempt) {
      return transaction
        .insert(schema.lessonGenerationAttempts)
        .values({
          requestId: record.requestId,
          tenantId: record.tenantId,
          attemptNumber: attempt.attemptNumber,
          idempotencyKey: attempt.idempotencyKey,
          state: attempt.state,
          correctionAttempted: attempt.correctionAttempted,
          diagnostics: attempt.diagnostics,
          provenance: attempt.provenance ?? null,
          createdAt: attempt.createdAt,
        })
        .onConflictDoNothing({
          target: [
            schema.lessonGenerationAttempts.tenantId,
            schema.lessonGenerationAttempts.idempotencyKey,
          ],
        })
        .returning({ requestId: schema.lessonGenerationAttempts.requestId })
    },

    async updateRequest(transaction, record) {
      await transaction
        .update(schema.lessonDraftRequests)
        .set(generationMutableValues(record))
        .where(
          and(
            eq(schema.lessonDraftRequests.tenantId, record.tenantId),
            eq(schema.lessonDraftRequests.id, record.requestId),
          ),
        )
    },

    findClaimConflict(transaction, record, attempt) {
      return transaction
        .select({ requestId: schema.lessonGenerationAttempts.requestId })
        .from(schema.lessonGenerationAttempts)
        .where(
          and(
            eq(schema.lessonGenerationAttempts.tenantId, record.tenantId),
            or(
              eq(
                schema.lessonGenerationAttempts.idempotencyKey,
                attempt.idempotencyKey,
              ),
              and(
                eq(schema.lessonGenerationAttempts.requestId, record.requestId),
                eq(
                  schema.lessonGenerationAttempts.attemptNumber,
                  attempt.attemptNumber,
                ),
              ),
            ),
          ),
        )
        .limit(1)
    },

    async expireRequest(
      transaction,
      tenantId,
      requestId,
      expectedUpdatedAt,
      updatedAt,
      diagnostics,
    ) {
      const requests = await transaction
        .update(schema.lessonDraftRequests)
        .set({
          state: 'failed-retryable',
          diagnostics: sql`${schema.lessonDraftRequests.diagnostics} || ${JSON.stringify(diagnostics)}::jsonb`,
          updatedAt,
        })
        .where(
          and(
            eq(schema.lessonDraftRequests.tenantId, tenantId),
            eq(schema.lessonDraftRequests.id, requestId),
            eq(schema.lessonDraftRequests.state, 'generating'),
            eq(schema.lessonDraftRequests.updatedAt, expectedUpdatedAt),
          ),
        )
        .returning({ attempt: schema.lessonDraftRequests.attempt })

      return requests[0]
    },

    async expireAttempt(
      transaction,
      tenantId,
      requestId,
      attemptNumber,
      diagnostics,
    ) {
      const attempts = await transaction
        .update(schema.lessonGenerationAttempts)
        .set({
          state: 'failed-retryable',
          diagnostics: sql`${schema.lessonGenerationAttempts.diagnostics} || ${JSON.stringify(diagnostics)}::jsonb`,
        })
        .where(
          and(
            eq(schema.lessonGenerationAttempts.tenantId, tenantId),
            eq(schema.lessonGenerationAttempts.requestId, requestId),
            eq(schema.lessonGenerationAttempts.attemptNumber, attemptNumber),
          ),
        )
        .returning({ requestId: schema.lessonGenerationAttempts.requestId })

      return attempts.length > 0
    },

    async updateRequestWithExpectation(transaction, record, expected) {
      const updated = await transaction
        .update(schema.lessonDraftRequests)
        .set(generationMutableValues(record))
        .where(
          and(
            eq(schema.lessonDraftRequests.tenantId, record.tenantId),
            eq(schema.lessonDraftRequests.id, record.requestId),
            eq(schema.lessonDraftRequests.state, 'generating'),
            eq(schema.lessonDraftRequests.attempt, expected.attempt),
            eq(schema.lessonDraftRequests.updatedAt, expected.updatedAt),
          ),
        )
        .returning({ id: schema.lessonDraftRequests.id })

      return updated.length > 0
    },

    async upsertAttempt(transaction, record, attempt) {
      await transaction
        .insert(schema.lessonGenerationAttempts)
        .values({
          requestId: record.requestId,
          tenantId: record.tenantId,
          attemptNumber: attempt.attemptNumber,
          idempotencyKey: attempt.idempotencyKey,
          state: attempt.state,
          correctionAttempted: attempt.correctionAttempted,
          diagnostics: attempt.diagnostics,
          provenance: attempt.provenance ?? null,
          createdAt: attempt.createdAt,
        })
        .onConflictDoUpdate({
          target: [
            schema.lessonGenerationAttempts.requestId,
            schema.lessonGenerationAttempts.attemptNumber,
          ],
          set: {
            state: attempt.state,
            correctionAttempted: attempt.correctionAttempted,
            diagnostics: attempt.diagnostics,
            provenance: attempt.provenance ?? null,
          },
        })
    },

    findGenerationByIdempotencyKey(tenantId, idempotencyKey) {
      return readGenerationByQuery(databaseUrl, tenantId, idempotencyKey)
    },

    readGeneration(tenantId, requestId) {
      return readGenerationByQuery(databaseUrl, tenantId, requestId, true)
    },
  }
}

export function createDrizzlePersistence(
  databaseUrl: string,
  options: DrizzlePersistenceOptions = {},
): FoundationPersistence {
  const observability = options.observability ?? serverObservability
  const generationPersistence = createGenerationPersistence(
    createDrizzleGenerationBackend(databaseUrl),
  )

  return {
    kind: 'postgres',
    ...generationPersistence,

    async check() {
      try {
        await withDatabase(databaseUrl, async (database) => {
          await database.execute(sql`select 1 as ok`)
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
        return await withDatabase(databaseUrl, async (database) =>
          database.transaction(async (transaction) => {
            await transaction.execute(
              sql`select set_config('app.tenant_id', ${demoSeed.tenant.id}, true)`,
            )

            const rows = await transaction.execute<DemoCountRow>(sql`
              select
                (select count(*)::int from tenants where id = ${demoSeed.tenant.id}) as tenants,
                (select count(*)::int from identities where tenant_id = ${demoSeed.tenant.id}) as identities,
                (select count(*)::int from standards where tenant_id = ${demoSeed.tenant.id}) as standards,
                (select count(*)::int from prerequisite_nodes where tenant_id = ${demoSeed.tenant.id}) as "graphNodes",
                (select count(*)::int from prerequisite_edges where tenant_id = ${demoSeed.tenant.id}) as "graphEdges",
                (select count(*)::int from activities where tenant_id = ${demoSeed.tenant.id}) as activities,
                (select count(*)::int from activity_versions where tenant_id = ${demoSeed.tenant.id}) as "activityVersions",
                (select count(*)::int from attempts where tenant_id = ${demoSeed.tenant.id}) as attempts
            `)
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
          }),
        )
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
  return withDatabase(databaseUrl, async (database) =>
    database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select set_config('app.tenant_id', ${tenantId}, true)`,
      )

      const requestId = byRequestId
        ? value
        : (
            await transaction
              .select({ requestId: schema.lessonGenerationAttempts.requestId })
              .from(schema.lessonGenerationAttempts)
              .where(
                and(
                  eq(schema.lessonGenerationAttempts.tenantId, tenantId),
                  eq(schema.lessonGenerationAttempts.idempotencyKey, value),
                ),
              )
              .limit(1)
          )[0]?.requestId

      if (!requestId) return undefined

      const requests = await transaction
        .select()
        .from(schema.lessonDraftRequests)
        .where(
          and(
            eq(schema.lessonDraftRequests.tenantId, tenantId),
            eq(schema.lessonDraftRequests.id, requestId),
          ),
        )
        .limit(1)
      if (requests.length === 0) return undefined
      const row = requests[0]

      const attempts = await transaction
        .select()
        .from(schema.lessonGenerationAttempts)
        .where(
          and(
            eq(schema.lessonGenerationAttempts.tenantId, tenantId),
            eq(schema.lessonGenerationAttempts.requestId, requestId),
          ),
        )
        .orderBy(asc(schema.lessonGenerationAttempts.attemptNumber))

      const storedRequest: StoredGenerationRequestRow = {
        requestId: row.id,
        tenantId: row.tenantId,
        teacherId: row.teacherId,
        prompt: row.prompt,
        grade: row.grade,
        standardId: row.standardId,
        language: row.language,
        difficulty: row.difficulty,
        state: row.state,
        attempt: row.attempt,
        diagnostics: row.diagnostics,
        draft: row.draft,
        provenance: row.provenance,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
      const storedAttempts: StoredGenerationAttemptRow[] = attempts.map(
        (attempt) => ({
          attemptNumber: attempt.attemptNumber,
          idempotencyKey: attempt.idempotencyKey,
          state: attempt.state,
          correctionAttempted: attempt.correctionAttempted,
          diagnostics: attempt.diagnostics,
          provenance: attempt.provenance,
          createdAt: attempt.createdAt,
        }),
      )

      return hydrateGenerationRecord(storedRequest, storedAttempts)
    }),
  )
}
