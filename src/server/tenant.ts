import { demoCapabilities } from '@/shared/demo'
import type { DemoCapability, DemoRole } from '@/shared/demo'

import { demoSeed, getSeedIdentity } from './seed-data'

export interface DemoSession {
  identityId: string
  displayName: string
  role: DemoRole
  tenantId: string
  tenantName: string
  capabilities: readonly DemoCapability[]
}

export function getDemoSession(role: DemoRole): DemoSession {
  const identity = getSeedIdentity(role)

  return {
    identityId: identity.id,
    displayName: identity.displayName,
    role: identity.role,
    tenantId: demoSeed.tenant.id,
    tenantName: demoSeed.tenant.name,
    capabilities: demoCapabilities[role],
  }
}

export function assertTenantAccess(
  session: DemoSession,
  tenantId: string,
): void {
  if (session.tenantId !== tenantId) {
    throw new Error('Tenant access denied.')
  }
}

export function canAccess(
  session: DemoSession,
  capability: DemoCapability,
): boolean {
  return session.capabilities.includes(capability)
}
