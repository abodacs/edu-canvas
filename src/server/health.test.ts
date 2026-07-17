import { describe, expect, it } from 'vitest'

import { getHealthPayload, getReadinessPayload } from './health.server'

describe('readiness', () => {
  it('returns a liveness payload with an ISO timestamp', () => {
    const payload = getHealthPayload()

    expect(payload).toMatchObject({
      status: 'ok',
      service: 'edu-canvas',
      check: 'liveness',
    })
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false)
  })

  it('reports the default synthetic repository as ready', async () => {
    const payload = await getReadinessPayload({})

    expect(payload.status).toBe('ready')
    expect(payload.persistence).toMatchObject({
      status: 'ready',
      kind: 'seeded-demo',
    })
  })

  it('reports actionable invalid configuration without secret values', async () => {
    const payload = await getReadinessPayload({
      APP_ENV: 'production',
      DEMO_MODE: 'false',
      DATABASE_URL: 'not-a-url',
    })

    expect(payload.status).toBe('not_ready')
    expect(JSON.stringify(payload)).toContain('DATABASE_URL')
    expect(JSON.stringify(payload)).not.toContain('not-a-url')
  })
})
