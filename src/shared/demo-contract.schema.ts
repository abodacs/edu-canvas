import { z } from 'zod'

import { demoRoles } from './demo-contract'

export const demoRoleSchema = z.enum(demoRoles)

const demoCountsSchema = z
  .object({
    tenants: z.number(),
    identities: z.number(),
    standards: z.number(),
    graphNodes: z.number(),
    graphEdges: z.number(),
    activities: z.number(),
    activityVersions: z.number(),
    attempts: z.number(),
  })
  .strict()

const demoEnvironmentSchema = z
  .object({
    appEnv: z.enum(['development', 'preview', 'production']),
    persistence: z.enum(['seeded-demo', 'postgres']),
    syntheticDataOnly: z.literal(true),
  })
  .strict()

const demoSessionSchema = z
  .object({
    identityId: z.string(),
    displayName: z.string(),
    role: demoRoleSchema,
    tenantId: z.string(),
    tenantName: z.string(),
    capabilities: z.array(z.string()).readonly(),
  })
  .strict()

const demoCurriculumSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    graphVersion: z.string(),
  })
  .strict()

export const demoSnapshotSchema = z
  .object({
    environment: demoEnvironmentSchema,
    session: demoSessionSchema,
    curriculum: demoCurriculumSchema,
    seededCounts: demoCountsSchema,
  })
  .strict()

export type DemoRole = z.infer<typeof demoRoleSchema>
export type DemoCounts = z.infer<typeof demoCountsSchema>
export type DemoSnapshot = z.infer<typeof demoSnapshotSchema>
