import { createMetaLessonDraftProvider } from "./provider";
import type { ServerConfig } from "@/server/config";

import type { LessonDraftProvider } from "./provider";

export const createConfiguredLessonDraftProvider = (
  config: ServerConfig
): LessonDraftProvider => {
  if (!config.metaApiKey) {
    throw new Error("Meta provider configuration is incomplete.");
  }

  return createMetaLessonDraftProvider({
    apiKey: config.metaApiKey,
    model: config.metaModel,
    baseUrl: config.metaBaseUrl,
    timeoutMs: config.metaTimeoutMs,
  });
};
