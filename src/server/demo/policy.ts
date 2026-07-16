import type { DemoRole } from '@/shared/demo-contract'
import { demoSeed, getSeedIdentity } from '../seed-data'

const demoCapabilities = {
  teacher: ['view_seeded_environment', 'view_demo_activity_fixtures'],
  student: ['view_seeded_environment', 'view_assigned_demo_activity'],
} as const satisfies Record<DemoRole, readonly string[]>

export type DemoCapability = (typeof demoCapabilities)[DemoRole][number]

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
