import type { FoundationPersistence } from '../persistence'
import type { LessonGenerationRecord } from '../generation/types'
import { serverObservability } from '../observability.server'
import type { ServerObservability } from '../observability.server'
import { getDemoSeedCounts } from '../seed-data'

export interface SeededPersistenceOptions {
  observability?: ServerObservability
  generationStore?: Map<string, LessonGenerationRecord>
}

export function createSeededPersistence(
  options: SeededPersistenceOptions = {},
): FoundationPersistence {
  const observability = options.observability ?? serverObservability
  const generationStore =
    options.generationStore ?? new Map<string, LessonGenerationRecord>()

  function findStoredGenerationByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): LessonGenerationRecord | undefined {
    for (const record of generationStore.values()) {
      if (
        record.tenantId === tenantId &&
        record.attempts.some(
          (attempt) => attempt.idempotencyKey === idempotencyKey,
        )
      ) {
        return record
      }
    }

    return undefined
  }

  return {
    kind: 'seeded-demo',

    async check() {
      try {
        getDemoSeedCounts()
      } catch (error) {
        observability.captureError(error, {
          operation: 'persistence.seeded.check',
          dependency: 'seeded-demo',
          reason: 'seed_integrity_failed',
          code: 'PERSISTENCE_UNAVAILABLE',
        })
        throw error
      }

      return {
        status: 'ready',
        kind: 'seeded-demo',
        code: 'READY',
        message: 'Synthetic seed repository is loaded.',
      }
    },

    async readDemoCounts() {
      try {
        return getDemoSeedCounts()
      } catch (error) {
        observability.captureError(error, {
          operation: 'persistence.seeded.read-demo-counts',
          dependency: 'seeded-demo',
          reason: 'seed_integrity_failed',
          code: 'PERSISTENCE_UNAVAILABLE',
        })
        throw error
      }
    },

    async claimGeneration(record) {
      const attempt = record.attempts.at(-1)
      if (!attempt) {
        throw new Error('A generation claim requires an attempt.')
      }

      const existing = findStoredGenerationByIdempotencyKey(
        record.tenantId,
        attempt.idempotencyKey,
      )
      if (existing) {
        return { claimed: false, record: structuredClone(existing) }
      }

      generationStore.set(
        `${record.tenantId}:${record.requestId}`,
        structuredClone(record),
      )
      return { claimed: true, record: structuredClone(record) }
    },

    async saveGeneration(record) {
      generationStore.set(
        `${record.tenantId}:${record.requestId}`,
        structuredClone(record),
      )
    },

    async findGenerationByIdempotencyKey(tenantId, idempotencyKey) {
      const record = findStoredGenerationByIdempotencyKey(
        tenantId,
        idempotencyKey,
      )
      return record ? structuredClone(record) : undefined
    },

    async readGeneration(tenantId, requestId) {
      const record = generationStore.get(`${tenantId}:${requestId}`)
      return record ? structuredClone(record) : undefined
    },
  }
}
