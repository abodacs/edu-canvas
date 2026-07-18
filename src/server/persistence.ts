import type { DemoCounts } from '@/shared/demo-contract'

import type { ServerConfig } from './config'
import type { GenerationPersistence } from './generation/types'
import { serverObservability } from './observability.server'
import type { ServerObservability } from './observability.server'
import { createDrizzlePersistence } from './persistence/drizzle'
import { createPostgresPersistence } from './persistence/postgres'
import { createSeededPersistence } from './persistence/seeded'

export interface PersistenceCheck {
  status: 'ready' | 'failed'
  kind: ServerConfig['mode']
  code: 'READY' | 'CONFIG_INVALID' | 'PERSISTENCE_UNAVAILABLE'
  message: string
}

export interface FoundationPersistence extends GenerationPersistence {
  readonly kind: ServerConfig['mode']
  check: () => Promise<PersistenceCheck>
  readDemoCounts: () => Promise<DemoCounts>
}

export interface FoundationPersistenceOptions {
  observability?: ServerObservability
}

const seededGenerationStore = new Map<
  string,
  Parameters<GenerationPersistence['saveGeneration']>[0]
>()

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
    return createSeededPersistence({
      generationStore: seededGenerationStore,
      observability,
    })
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

  if (config.persistenceAdapter === 'drizzle') {
    return createDrizzlePersistence(config.databaseUrl, options)
  }

  return createPostgresPersistence(config.databaseUrl, options)
}
