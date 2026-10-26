import { serverObservability } from "./observability.server";
import { createDrizzlePersistence } from "./persistence/drizzle";
import { createPostgresPersistence } from "./persistence/postgres";
import { createSeededPersistence } from "./persistence/seeded";

import type { ServerConfig } from "./config";
import type { GenerationPersistence } from "./generation/types";
import type {
  FoundationPersistence,
  FoundationPersistenceOptions,
} from "./persistence/types";

const seededGenerationStore = new Map<
  string,
  Parameters<GenerationPersistence["saveGeneration"]>[0]
>();

export const createFoundationPersistence = (
  config: ServerConfig,
  options: FoundationPersistenceOptions = {}
): FoundationPersistence => {
  const observability = options.observability ?? serverObservability;

  if (config.issues.length > 0) {
    const error = new Error(
      "Cannot create persistence for invalid configuration."
    );
    observability.captureError(error, {
      operation: "persistence.create",
      reason: "invalid_configuration",
      issueCodes: config.issues.map((issue) => issue.code),
    });
    throw error;
  }

  if (config.mode === "seeded-demo") {
    return createSeededPersistence({
      generationStore: seededGenerationStore,
      observability,
    });
  }

  if (!config.databaseUrl) {
    const error = new Error("PostgreSQL persistence requires DATABASE_URL.");
    observability.captureError(error, {
      operation: "persistence.create",
      reason: "missing_database_url",
      code: "DATABASE_REQUIRED",
    });
    throw error;
  }

  return config.persistenceAdapter === "drizzle"
    ? createDrizzlePersistence(config.databaseUrl, options)
    : createPostgresPersistence(config.databaseUrl, options);
};

export {
  type PersistenceCheck,
  type FoundationPersistence,
  type FoundationPersistenceOptions,
} from "./persistence/types";
