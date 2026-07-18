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
    | 'INVALID_SENTRY_DSN'
    | 'DATABASE_REQUIRED'
    | 'OPENAI_API_KEY_REQUIRED'
    | 'INVALID_OPENAI_BASE_URL'
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
  sentryDsn?: string
  openAiApiKey?: string
  openAiModel: string
  openAiBaseUrl: string
  issues: readonly ConfigIssue[]
}

export interface DatabaseBootstrapConfig {
  syntheticDataOnly: true
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

export function isValidSentryDsn(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.username.length > 0 &&
      url.hostname.length > 0 &&
      url.pathname.length > 1
    )
  } catch {
    return false
  }
}

const openAiBaseUrlSchema = z.string().refine((value) => {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))
    )
  } catch {
    return false
  }
}, 'OPENAI_BASE_URL must use HTTPS, or HTTP for a local loopback test server.')

function parseBoolean(
  value: string | undefined,
  fallback: boolean,
): { value: boolean; invalid: boolean } {
  if (value === undefined) return { value: fallback, invalid: false }
  if (value === 'true') return { value: true, invalid: false }
  if (value === 'false') return { value: false, invalid: false }
  return { value: fallback, invalid: true }
}

export function readDatabaseBootstrapConfig(
  env: Record<string, string | undefined> = process.env,
): DatabaseBootstrapConfig {
  const issues: ConfigIssue[] = []
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

  return {
    syntheticDataOnly: true,
    ...(databaseUrl ? { databaseUrl } : {}),
    issues,
  }
}

export function readServerConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const databaseConfig = readDatabaseBootstrapConfig(env)
  const issues: ConfigIssue[] = [...databaseConfig.issues]
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

  const syntheticDataOnly = databaseConfig.syntheticDataOnly
  const databaseUrl = databaseConfig.databaseUrl

  const sentryDsnValue = env.SENTRY_DSN?.trim() || undefined
  const sentryDsn =
    sentryDsnValue && isValidSentryDsn(sentryDsnValue)
      ? sentryDsnValue
      : undefined
  if (sentryDsnValue && !sentryDsn) {
    issues.push({
      code: 'INVALID_SENTRY_DSN',
      field: 'SENTRY_DSN',
      message: 'SENTRY_DSN must be a valid Sentry DSN URL.',
    })
  }

  if (!demoMode && !databaseUrl) {
    issues.push({
      code: 'DATABASE_REQUIRED',
      field: 'DATABASE_URL',
      message: 'Set DATABASE_URL when DEMO_MODE is false.',
    })
  }

  const openAiApiKey = env.OPENAI_API_KEY?.trim() || undefined
  const openAiModel = env.OPENAI_MODEL?.trim() || 'gpt-5.6'
  let openAiBaseUrl = env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1'

  if (!openAiBaseUrlSchema.safeParse(openAiBaseUrl).success) {
    issues.push({
      code: 'INVALID_OPENAI_BASE_URL',
      field: 'OPENAI_BASE_URL',
      message:
        'OPENAI_BASE_URL must use HTTPS, or HTTP for a local loopback test server.',
    })
    openAiBaseUrl = 'https://api.openai.com/v1'
  }

  if (!demoMode && !openAiApiKey) {
    issues.push({
      code: 'OPENAI_API_KEY_REQUIRED',
      field: 'OPENAI_API_KEY',
      message: 'Set OPENAI_API_KEY for server-side lesson generation.',
    })
  }

  return {
    appEnv,
    demoMode,
    syntheticDataOnly,
    mode: databaseUrl ? 'postgres' : 'seeded-demo',
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(sentryDsn ? { sentryDsn } : {}),
    ...(openAiApiKey ? { openAiApiKey } : {}),
    openAiModel,
    openAiBaseUrl,
    issues,
  }
}

export function safeConfigSummary(config: ServerConfig) {
  return {
    appEnv: config.appEnv,
    demoMode: config.demoMode,
    syntheticDataOnly: config.syntheticDataOnly,
    persistence: config.mode,
    observability: {
      sentry: config.sentryDsn ? 'configured' : 'structured-log-only',
    },
    issues: config.issues,
  }
}
