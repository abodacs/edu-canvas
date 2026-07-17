import { readServerConfig, safeConfigSummary } from './config'
import { createFoundationPersistence } from './persistence'

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
) {
  const config = readServerConfig(env)

  if (config.issues.length > 0) {
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

  const persistence = await createFoundationPersistence(config).check()
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
