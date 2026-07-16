export const demoRoles = ['teacher', 'student'] as const

export type DemoRole = (typeof demoRoles)[number]

export const demoCapabilities = {
  teacher: ['view_seeded_environment', 'view_demo_activity_fixtures'],
  student: ['view_seeded_environment', 'view_assigned_demo_activity'],
} as const satisfies Record<DemoRole, readonly string[]>

export type DemoCapability = (typeof demoCapabilities)[DemoRole][number]

export interface DemoCounts {
  tenants: number
  identities: number
  standards: number
  graphNodes: number
  graphEdges: number
  activities: number
  activityVersions: number
  attempts: number
}

export interface DemoSnapshot {
  environment: {
    appEnv: 'development' | 'preview' | 'production'
    persistence: 'seeded-demo' | 'postgres'
    syntheticDataOnly: true
  }
  session: {
    identityId: string
    displayName: string
    role: DemoRole
    tenantId: string
    tenantName: string
    capabilities: readonly string[]
  }
  curriculum: {
    id: string
    name: string
    graphVersion: string
  }
  seededCounts: DemoCounts
}

export function isDemoRole(value: string): value is DemoRole {
  return demoRoles.includes(value as DemoRole)
}
