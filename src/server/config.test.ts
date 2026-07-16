import { describe, expect, it } from 'vitest'

import { readServerConfig } from './config'

describe('server configuration', () => {
  it('defaults to a ready synthetic repository for a clean checkout', () => {
    const config = readServerConfig({})

    expect(config).toMatchObject({
      appEnv: 'development',
      demoMode: true,
      syntheticDataOnly: true,
      mode: 'seeded-demo',
      issues: [],
    })
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
})
