import type { DemoRole } from './demo-contract.schema'

export const demoRoles = ['teacher', 'student'] as const

export type { DemoCounts, DemoRole, DemoSnapshot } from './demo-contract.schema'

export function isDemoRole(value: string): value is DemoRole {
  return demoRoles.includes(value as DemoRole)
}
