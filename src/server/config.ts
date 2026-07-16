import { z } from 'zod'

const environmentValues = ['development', 'preview', 'production'] as const

export type ServerEnvironment = (typeof environmentValues)[number]
export type PersistenceMode = 'seeded-demo' | 'postgres'

export interface ConfigIssue {
  code:
    | 'INVALID_APP_ENV'
    | 'INVALID_DEMO_MODE'
    | 'INVALID_SYNTHETIC_DATA_ONLY'
    | 'INVALID_DATABASE_URL'
    | 'DATABASE_REQUIRED'
    | 'REAL_DATA_DISABLED'
  field: string
  message: string
}

export interface ServerConfig {
  appEnv: ServerEnvironment
  demoMode: boolean
  syntheticDataOnly: true
  mode: PersistenceMode
  databaseUrl?: string
  issues: readonly ConfigIssue[]
}

const databaseUrlSchema = z.string().refine((value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'postgres:' || url.protocol === 'postgresql:'
  } catch {
    return false
  }
}, 'DATABASE_URL must be a postgres:// or postgresql:// URL.')

function parseBoolean(
  value: string | undefined,
  fallback: boolean,
): { value: boolean; invalid: boolean } {
  if (value === undefined) return { value: fallback, invalid: false }
  if (value === 'true') return { value: true, invalid: false }
  if (value === 'false') return { value: false, invalid: false }
  return { value: fallback, invalid: true }
}

export function readServerConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const issues: ConfigIssue[] = []
  const requestedEnv =
    env.APP_ENV ??
    (env.NODE_ENV === 'production' ? 'production' : 'development')
  const appEnv = environmentValues.includes(requestedEnv as ServerEnvironment)
    ? (requestedEnv as ServerEnvironment)
    : 'development'

  if (!environmentValues.includes(requestedEnv as ServerEnvironment)) {
    issues.push({
      code: 'INVALID_APP_ENV',
      field: 'APP_ENV',
      message: 'APP_ENV must be development, preview, or production.',
    })
  }

  const demoModeResult = parseBoolean(env.DEMO_MODE, appEnv !== 'production')
  const demoMode = demoModeResult.value
  if (demoModeResult.invalid) {
    issues.push({
      code: 'INVALID_DEMO_MODE',
      field: 'DEMO_MODE',
      message: 'DEMO_MODE must be true or false.',
    })
  }

  const syntheticDataOnlyResult = parseBoolean(env.SYNTHETIC_DATA_ONLY, true)
  const syntheticDataOnly = syntheticDataOnlyResult.value
  if (syntheticDataOnlyResult.invalid) {
    issues.push({
      code: 'INVALID_SYNTHETIC_DATA_ONLY',
      field: 'SYNTHETIC_DATA_ONLY',
      message: 'SYNTHETIC_DATA_ONLY must be true or false.',
    })
  }
  if (!syntheticDataOnly) {
    issues.push({
      code: 'REAL_DATA_DISABLED',
      field: 'SYNTHETIC_DATA_ONLY',
      message:
        'Real-student mode is disabled until the compliance launch gate is approved.',
    })
  }

  const databaseUrl = env.DATABASE_URL?.trim() || undefined
  if (databaseUrl && !databaseUrlSchema.safeParse(databaseUrl).success) {
    issues.push({
      code: 'INVALID_DATABASE_URL',
      field: 'DATABASE_URL',
      message: 'DATABASE_URL must be a postgres:// or postgresql:// URL.',
    })
  }

  if (!demoMode && !databaseUrl) {
    issues.push({
      code: 'DATABASE_REQUIRED',
      field: 'DATABASE_URL',
      message: 'Set DATABASE_URL when DEMO_MODE is false.',
    })
  }

  return {
    appEnv,
    demoMode,
    syntheticDataOnly: true,
    mode: databaseUrl ? 'postgres' : 'seeded-demo',
    ...(databaseUrl ? { databaseUrl } : {}),
    issues,
  }
}

export function safeConfigSummary(config: ServerConfig) {
  return {
    appEnv: config.appEnv,
    demoMode: config.demoMode,
    syntheticDataOnly: config.syntheticDataOnly,
    persistence: config.mode,
    issues: config.issues,
  }
}
