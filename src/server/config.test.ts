import { describe, expect, it } from 'vitest'

import {
  readDatabaseBootstrapConfig,
  readServerConfig,
  safeConfigSummary,
} from './config'

describe('server configuration', () => {
  it('keeps synthetic database bootstrap independent of provider credentials', () => {
    const config = readDatabaseBootstrapConfig({
      APP_ENV: 'preview',
      DEMO_MODE: 'false',
      DATABASE_URL: 'postgresql://demo:secret@db.invalid:5432/app',
    })

    expect(config).toMatchObject({
      databaseUrl: 'postgresql://demo:secret@db.invalid:5432/app',
      syntheticDataOnly: true,
      issues: [],
    })
  })

  it('rejects real-student database bootstrap mode', () => {
    const config = readDatabaseBootstrapConfig({
      DATABASE_URL: 'postgresql://demo:secret@db.invalid:5432/app',
      SYNTHETIC_DATA_ONLY: 'false',
    })

    expect(config.issues).toContainEqual(
      expect.objectContaining({ code: 'REAL_DATA_DISABLED' }),
    )
  })

  it('defaults to a ready synthetic repository for a clean checkout', () => {
    const config = readServerConfig({})

    expect(config).toMatchObject({
      appEnv: 'development',
      demoMode: true,
      syntheticDataOnly: true,
      mode: 'seeded-demo',
      issues: [],
    })
    expect(config.sentryDsn).toBeUndefined()
    expect(safeConfigSummary(config)).toMatchObject({
      observability: { sentry: 'structured-log-only' },
    })
  })

  it('enables Sentry only for a valid server-side DSN without exposing it', () => {
    const dsn = 'https://public@example.ingest.sentry.io/123'
    const config = readServerConfig({ SENTRY_DSN: dsn })

    expect(config.sentryDsn).toBe(dsn)
    expect(safeConfigSummary(config)).toMatchObject({
      observability: { sentry: 'configured' },
    })
    expect(JSON.stringify(safeConfigSummary(config))).not.toContain(dsn)
  })

  it('fails safe for an invalid Sentry DSN without echoing its value', () => {
    const dsn = 'https://not-a-sentry-dsn'
    const config = readServerConfig({ SENTRY_DSN: dsn })

    expect(config.sentryDsn).toBeUndefined()
    expect(config.issues).toContainEqual({
      code: 'INVALID_SENTRY_DSN',
      field: 'SENTRY_DSN',
      message: 'SENTRY_DSN must be a valid Sentry DSN URL.',
    })
    expect(JSON.stringify(config.issues)).not.toContain(dsn)
  })

  it('rejects a non-TLS Sentry DSN', () => {
    const config = readServerConfig({
      SENTRY_DSN: 'http://public@example.ingest.sentry.io/123',
    })

    expect(config.sentryDsn).toBeUndefined()
    expect(config.issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_SENTRY_DSN' }),
    )
  })

  it('requires persistence when demo mode is disabled', () => {
    const config = readServerConfig({
      APP_ENV: 'production',
      DEMO_MODE: 'false',
    })

    expect(config.issues).toContainEqual({
      code: 'DATABASE_REQUIRED',
      field: 'DATABASE_URL',
      message: 'Set DATABASE_URL when DEMO_MODE is false.',
    })
  })

  it('reports invalid configuration without echoing secret values', () => {
    const secret = 'postgresql://demo:super-secret@db.invalid:5432/app'
    const config = readServerConfig({ DATABASE_URL: 'not-a-database-url' })

    expect(
      config.issues.some((issue) => issue.code === 'INVALID_DATABASE_URL'),
    ).toBe(true)
    expect(JSON.stringify(config.issues)).not.toContain(secret)
  })

  it('blocks real-student mode until the launch gate is approved', () => {
    const config = readServerConfig({ SYNTHETIC_DATA_ONLY: 'false' })

    expect(config.issues).toContainEqual({
      code: 'REAL_DATA_DISABLED',
      field: 'SYNTHETIC_DATA_ONLY',
      message:
        'Real-student mode is disabled until the compliance launch gate is approved.',
    })
  })

  it('fails safe for an invalid synthetic-data flag', () => {
    const config = readServerConfig({ SYNTHETIC_DATA_ONLY: 'yes' })

    expect(config.syntheticDataOnly).toBe(true)
    expect(config.issues).toContainEqual({
      code: 'INVALID_SYNTHETIC_DATA_ONLY',
      field: 'SYNTHETIC_DATA_ONLY',
      message: 'SYNTHETIC_DATA_ONLY must be true or false.',
    })
  })

  it('requires a server provider credential outside seeded demo mode', () => {
    const config = readServerConfig({
      APP_ENV: 'production',
      DEMO_MODE: 'false',
      DATABASE_URL: 'postgresql://demo:secret@db.invalid:5432/app',
    })

    expect(config.issues).toContainEqual({
      code: 'OPENAI_API_KEY_REQUIRED',
      field: 'OPENAI_API_KEY',
      message: 'Set OPENAI_API_KEY for server-side lesson generation.',
    })
  })

  it('keeps the provider credential out of the safe configuration summary', async () => {
    const config = readServerConfig({ OPENAI_API_KEY: 'server-secret' })

    expect(JSON.stringify(safeConfigSummary(config))).not.toContain(
      'server-secret',
    )
  })

  it('rejects a non-HTTPS provider endpoint outside local development', () => {
    const config = readServerConfig({
      OPENAI_BASE_URL: 'ftp://untrusted.invalid',
    })

    expect(config.issues).toContainEqual({
      code: 'INVALID_OPENAI_BASE_URL',
      field: 'OPENAI_BASE_URL',
      message:
        'OPENAI_BASE_URL must use HTTPS, or HTTP for a local loopback test server.',
    })
    expect(config.openAiBaseUrl).toBe('https://api.openai.com/v1')
  })
})
