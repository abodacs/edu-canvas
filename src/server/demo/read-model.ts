import type { DemoRole, DemoSnapshot } from '@/shared/demo-contract'
import { demoSnapshotSchema } from '@/shared/demo-contract.schema'

import { readServerConfig } from '../config'
import { createFoundationPersistence } from '../persistence'
import { demoSeed } from '../seed-data'

import { assertTenantAccess, getDemoSession } from './policy'

export async function readDemoSnapshot(
  role: DemoRole,
  env: Record<string, string | undefined> = process.env,
): Promise<DemoSnapshot> {
  const config = readServerConfig(env)
  if (config.issues.length > 0) {
    throw new Error('Demo environment configuration is invalid.')
  }

  const session = getDemoSession(role)
  assertTenantAccess(session, demoSeed.tenant.id)
  const counts = await createFoundationPersistence(config).readDemoCounts()

  return demoSnapshotSchema.parse({
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
    curriculum: {
      id: demoSeed.standard.id,
      name: demoSeed.standard.name,
      graphVersion: demoSeed.activityVersion.graphVersion,
    },
    seededCounts: counts,
  })
}
