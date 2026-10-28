import { serverObservability } from "./observability.server";
import { createDrizzlePersistence } from "./persistence/drizzle";
import { createPostgresIdentityPersistence } from "./persistence/identity-postgres";
import { createSeededIdentityPersistence } from "./persistence/identity-seeded";
import { createPostgresPersistence } from "./persistence/postgres";
import { createRecordCommands } from "./persistence/records-commands";
import { createDrizzleRecordBackend } from "./persistence/records-drizzle";
import { createPostgresRecordBackend } from "./persistence/records-postgres";
import { createSeededRecordBackend } from "./persistence/records-seeded";
import { createSeededPersistence } from "./persistence/seeded";

import type { ServerConfig } from "./config";
import type { GenerationPersistence } from "./generation/types";
import type { IdentityPersistence } from "./identity/persistence-port";
import type { RecordPersistence } from "./persistence/records-commands";
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

const seededRecordBackend = createSeededRecordBackend();

/**
 * Records are their own port, like identity. The focused-loop records are not
 * generation state and not demo counts; keeping the port separate stops the
 * generation contract from growing record-shaped methods and matches the
 * identity boundary's precedent.
 */
export const createRecordPersistence = (
  config: ServerConfig
): RecordPersistence => {
  if (config.issues.length > 0) {
    throw new Error("Cannot create record persistence for invalid config.");
  }

  if (config.mode === seededDemoMode) {
    return createRecordCommands(seededRecordBackend);
  }

  if (!config.databaseUrl) {
    throw new Error("PostgreSQL record persistence requires DATABASE_URL.");
  }

  if (config.persistenceAdapter === "drizzle") {
    return createRecordCommands(
      createDrizzleRecordBackend({ databaseUrl: config.databaseUrl })
    );
  }

  return createRecordCommands(
    createPostgresRecordBackend({ databaseUrl: config.databaseUrl })
  );
};

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

export {
  type PersistenceCheck,
  type FoundationPersistence,
  type FoundationPersistenceOptions,
} from "./persistence/types";
