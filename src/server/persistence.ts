import type { DemoCounts } from '@/shared/demo-contract'

import type { ServerConfig } from './config'
import { serverObservability } from './observability.server'
import type { ServerObservability } from './observability.server'
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

export interface FoundationPersistenceOptions {
  observability?: ServerObservability
}

export function createFoundationPersistence(
  config: ServerConfig,
  options: FoundationPersistenceOptions = {},
): FoundationPersistence {
  const observability = options.observability ?? serverObservability

  if (config.issues.length > 0) {
    const error = new Error(
      'Cannot create persistence for invalid configuration.',
    )
    observability.captureError(error, {
      operation: 'persistence.create',
      reason: 'invalid_configuration',
      issueCodes: config.issues.map((issue) => issue.code),
    })
    throw error
  }

  if (config.mode === 'seeded-demo') {
    return createSeededPersistence({ observability })
  }

  if (!config.databaseUrl) {
    const error = new Error('PostgreSQL persistence requires DATABASE_URL.')
    observability.captureError(error, {
      operation: 'persistence.create',
      reason: 'missing_database_url',
      code: 'DATABASE_REQUIRED',
    })
    throw error
  }

  return createPostgresPersistence(config.databaseUrl, options)
}
