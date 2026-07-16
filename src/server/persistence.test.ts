import { describe, expect, it } from 'vitest'

import { createServerObservability } from './observability.server'
import { readServerConfig } from './config'
import type { ServerConfig } from './config'
import { createFoundationPersistence } from './persistence'

describe('foundation persistence boundary', () => {
  it('observes invalid configuration before refusing to create persistence', () => {
    const events: unknown[] = []
    const observability = createServerObservability({
      logger: (event) => events.push(event),
      sentry: null,
    })
    const config = readServerConfig({
      APP_ENV: 'production',
      DEMO_MODE: 'false',
      DATABASE_URL: 'not-a-url',
      OPENAI_API_KEY: 'test-server-key',
    })

    expect(() =>
      createFoundationPersistence(config, { observability }),
    ).toThrow('Cannot create persistence for invalid configuration.')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      operation: 'persistence.create',
      context: {
        reason: 'invalid_configuration',
        issueCodes: ['INVALID_DATABASE_URL'],
      },
    })
  })

  it('observes a missing database URL before refusing PostgreSQL persistence', () => {
    const events: unknown[] = []
    const observability = createServerObservability({
      logger: (event) => events.push(event),
      sentry: null,
    })
    const config: ServerConfig = {
      appEnv: 'production',
      demoMode: false,
      syntheticDataOnly: true,
      mode: 'postgres',
      openAiModel: 'gpt-5.6',
      openAiBaseUrl: 'https://api.openai.com/v1',
      issues: [],
    }

    expect(() =>
      createFoundationPersistence(config, { observability }),
    ).toThrow('PostgreSQL persistence requires DATABASE_URL.')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      operation: 'persistence.create',
      context: {
        reason: 'missing_database_url',
        code: 'DATABASE_REQUIRED',
      },
    })
  })
})
