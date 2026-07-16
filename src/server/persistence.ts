import type { DemoCounts } from '@/shared/demo-contract'

import type { ServerConfig } from './config'
import { createPostgresPersistence } from './persistence/postgres'
import { createSeededPersistence } from './persistence/seeded'

export interface PersistenceCheck {
  status: 'ready' | 'failed'
  kind: ServerConfig['mode']
  code: 'READY' | 'CONFIG_INVALID' | 'PERSISTENCE_UNAVAILABLE'
  message: string
}

export interface FoundationPersistence {
  readonly kind: ServerConfig['mode']
  check: () => Promise<PersistenceCheck>
  readDemoCounts: () => Promise<DemoCounts>
}

export function createFoundationPersistence(
  config: ServerConfig,
): FoundationPersistence {
  if (config.issues.length > 0) {
    throw new Error('Cannot create persistence for invalid configuration.')
  }

  if (config.mode === 'seeded-demo') {
    return createSeededPersistence()
  }

  if (!config.databaseUrl) {
    throw new Error('PostgreSQL persistence requires DATABASE_URL.')
  }

  return createPostgresPersistence(config.databaseUrl)
}
