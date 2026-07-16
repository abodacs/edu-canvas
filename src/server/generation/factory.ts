import type { ServerConfig } from '@/server/config'

import {
  createDeterministicLessonDraftProvider,
  createOpenAILessonDraftProvider,
} from './provider'
import type { LessonDraftProvider } from './provider'

export function createConfiguredLessonDraftProvider(
  config: ServerConfig,
): LessonDraftProvider {
  if (config.demoMode) {
    return createDeterministicLessonDraftProvider()
  }

  if (!config.openAiApiKey) {
    throw new Error('OpenAI provider configuration is incomplete.')
  }

  return createOpenAILessonDraftProvider({
    apiKey: config.openAiApiKey,
    model: config.openAiModel,
    baseUrl: config.openAiBaseUrl,
  })
}
