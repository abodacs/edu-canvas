import type { FoundationPersistence } from '../persistence'
import { getDemoSeedCounts } from '../seed-data'

export function createSeededPersistence(): FoundationPersistence {
  return {
    kind: 'seeded-demo',

    async check() {
      getDemoSeedCounts()

      return {
        status: 'ready',
        kind: 'seeded-demo',
        code: 'READY',
        message: 'Synthetic seed repository is loaded.',
      }
    },

    async readDemoCounts() {
      return getDemoSeedCounts()
    },
  }
}
