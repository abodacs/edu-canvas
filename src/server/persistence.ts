import { serverObservability } from "./observability.server";
import { createDrizzlePersistence } from "./persistence/drizzle";
import { createPostgresIdentityPersistence } from "./persistence/identity-postgres";
import { createSeededIdentityPersistence } from "./persistence/identity-seeded";
import { createPostgresPackPersistence } from "./persistence/pack-postgres";
import {
  createSeededPackPersistence,
  createSeededPackStore,
} from "./persistence/pack-seeded";
import { createPostgresPersistence } from "./persistence/postgres";
import { createSeededPersistence } from "./persistence/seeded";
import { syntheticLearnerDirectory } from "./identity/synthetic-fixture";

import type { ServerConfig } from "./config";
import type { GenerationPersistence } from "./generation/types";
import type { IdentityPersistence } from "./identity/persistence-port";
import type { PackPersistence } from "./persistence/pack-port";
import type {
  FoundationPersistence,
  FoundationPersistenceOptions,
} from "./persistence/types";

const seededGenerationStore = new Map<
  string,
  Parameters<GenerationPersistence["saveGeneration"]>[0]
>();

const seededDemoMode = "seeded-demo";

const identityPersistenceCache = new Map<string, IdentityPersistence>();

/**
 * Identity persistence is a separate port from generation persistence: the identity boundary owns actors, bindings, memberships, and sessions, and the generation boundary owns drafts and attempts.
 */
export const createIdentityPersistence = (
  config: ServerConfig,
  options: FoundationPersistenceOptions = {}
): IdentityPersistence => {
  if (config.issues.length > 0) {
    throw new Error("Cannot create identity persistence for invalid config.");
  }

  if (config.mode === seededDemoMode) {
    const cached = identityPersistenceCache.get(seededDemoMode);
    if (cached) {
      return cached;
    }
    const created = createSeededIdentityPersistence(options);
    identityPersistenceCache.set(seededDemoMode, created);
    return created;
  }

  if (!config.databaseUrl) {
    throw new Error("PostgreSQL identity persistence requires DATABASE_URL.");
  }

  return createPostgresIdentityPersistence(config.databaseUrl, options);
};

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

  if (config.mode === seededDemoMode) {
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

const seededPackStore = createSeededPackStore(syntheticLearnerDirectory);

/**
The generated-pack port (#5). It is separate from the foundation port so the
publication context owns its tables and the generation context keeps its own
record. Seeded mode shares one module-level store, like generation and
identity, so a write and a later read in the same process agree.
*/
export const createPackPersistence = (
  config: ServerConfig
): PackPersistence => {
  if (config.issues.length > 0) {
    throw new Error("Cannot create pack persistence for invalid config.");
  }

  if (config.mode === seededDemoMode) {
    return createSeededPackPersistence({ store: seededPackStore });
  }

  if (!config.databaseUrl) {
    throw new Error("PostgreSQL pack persistence requires DATABASE_URL.");
  }

  return createPostgresPackPersistence(config.databaseUrl);
};

export {
  type PersistenceCheck,
  type FoundationPersistence,
  type FoundationPersistenceOptions,
} from "./persistence/types";
