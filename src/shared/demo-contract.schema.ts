import { z } from 'zod'

import { demoRoles } from './demo-contract'

export const demoRoleSchema = z.enum(demoRoles)

const demoCountsSchema = z.strictObject({
  tenants: z.number(),
  identities: z.number(),
  standards: z.number(),
  graphNodes: z.number(),
  graphEdges: z.number(),
  activities: z.number(),
  activityVersions: z.number(),
  attempts: z.number(),
})

const demoEnvironmentSchema = z.strictObject({
  appEnv: z.enum(['development', 'preview', 'production']),
  persistence: z.enum(['seeded-demo', 'postgres']),
  syntheticDataOnly: z.literal(true),
})

const demoSessionSchema = z.strictObject({
  identityId: z.string(),
  displayName: z.string(),
  role: demoRoleSchema,
  tenantId: z.string(),
  tenantName: z.string(),
  capabilities: z.array(z.string()).readonly(),
})

const demoCurriculumSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  graphVersion: z.string(),
})

export const demoSnapshotSchema = z.strictObject({
  environment: demoEnvironmentSchema,
  session: demoSessionSchema,
  curriculum: demoCurriculumSchema,
  seededCounts: demoCountsSchema,
})

export type DemoRole = z.infer<typeof demoRoleSchema>
export type DemoCounts = z.infer<typeof demoCountsSchema>
export type DemoSnapshot = z.infer<typeof demoSnapshotSchema>
