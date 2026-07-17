import { readServerConfig, safeConfigSummary } from './config'
import { serverObservability } from './observability.server'
import type { ServerObservability } from './observability.server'
import { createFoundationPersistence } from './persistence'

export interface ReadinessOptions {
  observability?: ServerObservability
}

export function getHealthPayload() {
  return {
    status: 'ok' as const,
    service: 'edu-canvas',
    check: 'liveness',
    timestamp: new Date().toISOString(),
  }
}

export async function getReadinessPayload(
  env: Record<string, string | undefined> = process.env,
  options: ReadinessOptions = {},
) {
  const config = readServerConfig(env)
  const observability = options.observability ?? serverObservability

  if (config.issues.length > 0) {
    observability.captureError(new Error('Readiness check failed.'), {
      operation: 'health.readiness',
      reason: 'invalid_configuration',
      issueCodes: config.issues.map((issue) => issue.code),
    })

    return {
      status: 'not_ready' as const,
      check: 'readiness',
      config: safeConfigSummary(config),
      persistence: {
        status: 'failed' as const,
        code: 'CONFIG_INVALID' as const,
        message:
          'Server configuration is invalid. Correct the listed fields before redeploying.',
      },
    }
  }

  const persistence = await createFoundationPersistence(config, {
    observability,
  }).check()
  return {
    status:
      persistence.status === 'ready'
        ? ('ready' as const)
        : ('not_ready' as const),
    check: 'readiness',
    config: safeConfigSummary(config),
    persistence,
  }
}
export async function getReadinessWithSeedSummary(
  env: Record<string, string | undefined> = process.env,
  options: ReadinessOptions = {},
) {
  const readiness = await getReadinessPayload(env, options)
  if (readiness.status !== 'ready') return readiness

  const config = readServerConfig(env)
  const observability = options.observability ?? serverObservability
  try {
    const counts = await createFoundationPersistence(config, {
      observability,
    }).readDemoCounts()
    return { ...readiness, seededCounts: counts }
  } catch (error) {
    observability.captureError(error, {
      operation: 'health.readiness.seed-summary',
      dependency: config.mode,
      reason: 'persistence_read_failed',
      code: 'PERSISTENCE_UNAVAILABLE',
    })
    throw error
  }
}
