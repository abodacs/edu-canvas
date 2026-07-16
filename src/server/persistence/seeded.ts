import type { FoundationPersistence } from '../persistence'
import { serverObservability } from '../observability.server'
import type { ServerObservability } from '../observability.server'
import { getDemoSeedCounts } from '../seed-data'

export interface SeededPersistenceOptions {
  observability?: ServerObservability
}

export function createSeededPersistence(
  options: SeededPersistenceOptions = {},
): FoundationPersistence {
  const observability = options.observability ?? serverObservability

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
  }
}
