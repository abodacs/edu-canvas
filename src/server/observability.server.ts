import * as Sentry from '@sentry/node'

import { isValidSentryDsn } from './config'
import type { ServerEnvironment } from './config'

const serverEnvironments = new Set<ServerEnvironment>([
  'development',
  'preview',
  'production',
])

const safeContextKeys = new Set([
  'reason',
  'issueCodes',
  'dependency',
  'code',
  'safeCode',
  'route',
  'statusCode',
])

const safeReasons = new Set([
  'access_denied',
  'contract_violation',
  'invalid_configuration',
  'missing_database_url',
  'persistence_read_failed',
  'persistence_unavailable',
  'seed_integrity_failed',
])
const safeDependencies = new Set(['postgres', 'seeded-demo'])
const safeRoutes = new Set([
  '/api/health',
  '/api/readiness',
  '/demo/student',
  '/demo/teacher',
])
const safeIssueCodePattern = /^[A-Z][A-Z0-9_]+$/

const sensitiveStringPatterns: readonly [RegExp, string][] = [
  [/(?:postgres(?:ql)?|https?):\/\/[^\s]+/gi, '[REDACTED_URL]'],
  [/bearer\s+[^\s]+/gi, 'Bearer [REDACTED]'],
  [/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]'],
  [/\b(?:student|child|identity)[_-][A-Za-z0-9_-]+\b/gi, '[REDACTED_ID]'],
  [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    '[REDACTED_ID]',
  ],
]

export interface ServerObservabilityContext {
  readonly [key: string]: unknown
}

export interface StructuredServerError {
  schema: 'edu-canvas.server-error.v1'
  timestamp: string
  level: 'error'
  service: 'edu-canvas'
  environment: ServerEnvironment
  operation: string
  error: {
    name: string
    message: string
    stack?: string
  }
  context: Record<string, unknown>
  delivery: 'sentry' | 'structured-log'
}

export interface SentryReporter {
  captureException: (error: Error, event: StructuredServerError) => void
}

export interface ServerObservability {
  captureError: (
    error: unknown,
    context?: ServerObservabilityContext,
  ) => StructuredServerError
}

export interface CreateServerObservabilityOptions {
  env?: Record<string, string | undefined>
  logger?: (event: StructuredServerError) => void
  sentry?: SentryReporter | null
  now?: () => Date
}

function getEnvironment(
  env: Record<string, string | undefined>,
): ServerEnvironment {
  const requested = env.APP_ENV
  if (requested && serverEnvironments.has(requested as ServerEnvironment)) {
    return requested as ServerEnvironment
  }

  return env.NODE_ENV === 'production' ? 'production' : 'development'
}

function scrubString(value: string): string {
  return sensitiveStringPatterns.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    value,
  )
}

function normalizeError(error: unknown): StructuredServerError['error'] {
  if (error instanceof Error) {
    return {
      name: scrubString(error.name || 'Error'),
      message: scrubString(error.message || 'Unknown server error.'),
      ...(error.stack ? { stack: scrubString(error.stack) } : {}),
    }
  }

  return {
    name: 'UnknownError',
    message: scrubString(String(error)),
  }
}

function scrubContext(context: ServerObservabilityContext) {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      safeContextKeys.has(key) ? scrubContextValue(key, value) : '[REDACTED]',
    ]),
  )
}

function scrubContextValue(key: string, value: unknown): unknown {
  if (key === 'reason') {
    return typeof value === 'string' && safeReasons.has(value)
      ? value
      : '[REDACTED]'
  }

  if (key === 'dependency') {
    return typeof value === 'string' && safeDependencies.has(value)
      ? value
      : '[REDACTED]'
  }

  if (key === 'route') {
    return typeof value === 'string' && safeRoutes.has(value)
      ? value
      : '[REDACTED]'
  }

  if (key === 'statusCode') {
    return typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 100 &&
      value <= 599
      ? value
      : '[REDACTED]'
  }

  if (key === 'issueCodes') {
    return Array.isArray(value)
      ? value.map((code) =>
          typeof code === 'string' && safeIssueCodePattern.test(code)
            ? code
            : '[REDACTED]',
        )
      : '[REDACTED]'
  }

  if (key === 'code' || key === 'safeCode') {
    return typeof value === 'string' && safeIssueCodePattern.test(value)
      ? value
      : '[REDACTED]'
  }

  return '[REDACTED]'
}

function toSentryError(error: StructuredServerError['error']): Error {
  const sanitized = new Error(error.message)
  sanitized.name = error.name
  if (error.stack) sanitized.stack = error.stack
  return sanitized
}

function createDefaultSentryReporter(
  env: Record<string, string | undefined>,
): SentryReporter | undefined {
  const dsn = env.SENTRY_DSN?.trim()
  if (!dsn || !isValidSentryDsn(dsn)) return undefined

  try {
    Sentry.init({
      dsn,
      environment: getEnvironment(env),
      defaultIntegrations: false,
      sendDefaultPii: false,
      beforeSend(event) {
        delete event.user
        delete event.request
        delete event.extra
        delete event.breadcrumbs
        const context = event.contexts?.['edu-canvas']
        if (context && typeof context === 'object' && !Array.isArray(context)) {
          event.contexts = {
            'edu-canvas': scrubContext(context),
          }
        } else {
          delete event.contexts
        }
        return event
      },
    })
  } catch {
    return undefined
  }

  return {
    captureException(error, event) {
      Sentry.withIsolationScope((scope) => {
        scope.clear()
        scope.setTag('operation', event.operation)
        scope.setContext('edu-canvas', event.context)
        Sentry.captureException(error)
      })
    },
  }
}

export function createServerObservability(
  options: CreateServerObservabilityOptions = {},
): ServerObservability {
  const env = options.env ?? process.env
  const environment = getEnvironment(env)
  const logger =
    options.logger ?? ((event) => console.error(JSON.stringify(event)))
  const sentryOverride = options.sentry
  let defaultSentry: SentryReporter | undefined
  let defaultSentryInitialized = sentryOverride !== undefined
  const now = options.now ?? (() => new Date())

  function getDefaultSentry() {
    if (!defaultSentryInitialized) {
      defaultSentryInitialized = true
      defaultSentry = createDefaultSentryReporter(env)
    }

    return defaultSentry
  }

  return {
    captureError(error, context = {}) {
      const { operation: requestedOperation, ...rawContext } = context
      const operation =
        typeof requestedOperation === 'string'
          ? scrubString(requestedOperation)
          : 'unknown'
      const normalizedError = normalizeError(error)
      const safeContext = scrubContext(rawContext)
      const sentryEvent: StructuredServerError = {
        schema: 'edu-canvas.server-error.v1',
        timestamp: now().toISOString(),
        level: 'error',
        service: 'edu-canvas',
        environment,
        operation,
        error: normalizedError,
        context: safeContext,
        delivery: 'sentry',
      }

      let delivery: StructuredServerError['delivery'] = 'structured-log'
      const sentry =
        sentryOverride === undefined
          ? getDefaultSentry()
          : (sentryOverride ?? undefined)
      if (sentry) {
        try {
          sentry.captureException(toSentryError(normalizedError), sentryEvent)
          delivery = 'sentry'
        } catch {
          delivery = 'structured-log'
        }
      }

      const event = { ...sentryEvent, delivery }
      logger(event)
      return event
    },
  }
}

export const serverObservability = createServerObservability()
