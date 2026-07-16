import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { demoRoleSchema } from '@/shared/demo-contract.schema'

import { readDemoSnapshot } from './read-model'

const demoAccessInput = z.object({
  role: demoRoleSchema,
})

export const getDemoSnapshot = createServerFn({ method: 'GET' })
  .validator((input) => demoAccessInput.parse(input))
  .handler(async ({ data }) => readDemoSnapshot(data.role))
