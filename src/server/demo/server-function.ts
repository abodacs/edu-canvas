import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { demoRoleSchema } from '@/shared/demo-contract.schema'
import { lessonGenerationInputSchema } from '@/shared/generation-contract'

import { readServerConfig } from '../config'
import { createConfiguredLessonDraftProvider } from '../generation/factory'
import { createGenerationService } from '../generation/service'
import { createFoundationPersistence } from '../persistence'

import { getDemoSession } from './policy'
import { readDemoSnapshot } from './read-model'

const demoAccessInput = z.object({
  role: demoRoleSchema,
})

export const getDemoSnapshot = createServerFn({ method: 'GET' })
  .validator((input) => demoAccessInput.parse(input))
  .handler(async ({ data }) => readDemoSnapshot(data.role))

const generateLessonDraftInput = z
  .object({
    role: demoRoleSchema,
    input: lessonGenerationInputSchema,
  })
  .strict()

export const generateLessonDraft = createServerFn({ method: 'POST' })
  .validator((input) => generateLessonDraftInput.parse(input))
  .handler(async ({ data }) => {
    const config = readServerConfig()
    if (config.issues.length > 0) {
      throw new Error('Lesson generation configuration is invalid.')
    }

    const service = createGenerationService({
      persistence: createFoundationPersistence(config),
      provider: createConfiguredLessonDraftProvider(config),
    })

    const result = await service.generate({
      session: getDemoSession(data.role),
      input: data.input,
    })

    return result.publicResult
  })
