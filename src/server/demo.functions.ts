import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { buildDemoSnapshot } from './demo'
import { readServerConfig } from './config'
import { readDemoCounts } from './persistence.server'
import { demoSeed } from './seed-data'
import { assertTenantAccess, getDemoSession } from './tenant'

const demoAccessInput = z.object({
  role: z.enum(['teacher', 'student']),
})

export const getDemoSnapshot = createServerFn({ method: 'GET' })
  .validator((input) => demoAccessInput.parse(input))
  .handler(async ({ data }) => {
    const config = readServerConfig()
    if (config.issues.length > 0) {
      throw new Error('Demo environment configuration is invalid.')
    }

    const session = getDemoSession(data.role)
    assertTenantAccess(session, demoSeed.tenant.id)
    const counts = await readDemoCounts(config)

    return buildDemoSnapshot({
      config,
      counts,
      session,
      standard: {
        id: demoSeed.standard.id,
        name: demoSeed.standard.name,
        graphVersion: demoSeed.activityVersion.graphVersion,
      },
    })
  })
