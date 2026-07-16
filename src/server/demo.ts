import type { DemoCounts, DemoSnapshot } from '@/shared/demo'

import type { ServerConfig } from './config'
import type { DemoSession } from './tenant'

export function buildDemoSnapshot({
  config,
  counts,
  session,
  standard,
}: {
  config: ServerConfig
  counts: DemoCounts
  session: DemoSession
  standard: { id: string; name: string; graphVersion: string }
}): DemoSnapshot {
  return {
    environment: {
      appEnv: config.appEnv,
      persistence: config.mode,
      syntheticDataOnly: true,
    },
    session: {
      identityId: session.identityId,
      displayName: session.displayName,
      role: session.role,
      tenantId: session.tenantId,
      tenantName: session.tenantName,
      capabilities: session.capabilities,
    },
    curriculum: standard,
    seededCounts: counts,
  }
}
