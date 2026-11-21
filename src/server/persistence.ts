import { serverObservability } from "./observability.server";
import { createPostgresIdentityPersistence } from "./persistence/identity-postgres";
import { createPostgresGenerationLimitStore } from "./persistence/limits-postgres";
import { createPostgresPackPersistence } from "./persistence/pack-postgres";
import { createPostgresPersistence } from "./persistence/postgres";
import { createRecordCommands } from "./persistence/records-commands";
import { createPostgresRecordBackend } from "./persistence/records-postgres";
import { createPostgresStandardGroundingPersistence } from "./persistence/standard-grounding-postgres";

import type { ServerConfig } from "./config";
import type { IdentityPersistence } from "./identity/persistence-port";
import type { GenerationLimitStore } from "./limits/contract";
import type { PackPersistence } from "./persistence/pack-port";
import type { RecordPersistence } from "./persistence/records-commands";
import type { StandardGroundingPersistence } from "./persistence/standard-grounding-port";
import type {
  FoundationPersistence,
  FoundationPersistenceOptions,
} from "./persistence/types";

const requireDatabaseUrl = (config: ServerConfig, port: string): string => {
  if (config.issues.length > 0) {
    throw new Error(`Cannot create ${port} persistence for invalid config.`);
  }

  if (config.databaseUrl === undefined) {
    throw new Error(`PostgreSQL ${port} persistence requires DATABASE_URL.`);
  }

  return config.databaseUrl;
};

export const createIdentityPersistence = (
  config: ServerConfig,
  options: FoundationPersistenceOptions = {}
): IdentityPersistence => {
  return createPostgresIdentityPersistence(
    requireDatabaseUrl(config, "identity"),
    options
  );
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

  if (config.databaseUrl === undefined) {
    const error = new Error("PostgreSQL persistence requires DATABASE_URL.");
    observability.captureError(error, {
      operation: "persistence.create",
      reason: "missing_database_url",
      code: "DATABASE_REQUIRED",
    });
    throw error;
  }

  return createPostgresPersistence(config.databaseUrl, options);
};

export const createPackPersistence = (config: ServerConfig): PackPersistence =>
  createPostgresPackPersistence(requireDatabaseUrl(config, "pack"));

export const createGenerationLimitStore = (
  config: ServerConfig
): GenerationLimitStore => {
  return createPostgresGenerationLimitStore(
    requireDatabaseUrl(config, "limits")
  );
};

export const createRecordPersistence = (
  config: ServerConfig
): RecordPersistence => {
  return createRecordCommands(
    createPostgresRecordBackend({
      databaseUrl: requireDatabaseUrl(config, "record"),
    })
  );
};

export const createStandardGroundingPersistence = (
  config: ServerConfig
): StandardGroundingPersistence => {
  return createPostgresStandardGroundingPersistence(
    requireDatabaseUrl(config, "standard grounding")
  );
};

export {
  type PersistenceCheck,
  type FoundationPersistence,
  type FoundationPersistenceOptions,
} from "./persistence/types";
