import { serverObservability } from "./observability.server";
import { createPostgresIdentityPersistence } from "./persistence/identity-postgres";
import { createPostgresPackPersistence } from "./persistence/pack-postgres";
import { createPostgresPersistence } from "./persistence/postgres";
import { createRecordCommands } from "./persistence/records-commands";
import { createPostgresRecordBackend } from "./persistence/records-postgres";

import type { ServerConfig } from "./config";
import type { IdentityPersistence } from "./identity/persistence-port";
import type { PackPersistence } from "./persistence/pack-port";
import type { RecordPersistence } from "./persistence/records-commands";
import type {
  FoundationPersistence,
  FoundationPersistenceOptions,
} from "./persistence/types";

/**
PostgreSQL is the only runtime store. Every port below refuses an invalid
configuration and a missing `DATABASE_URL` the same way, so a new port cannot
quietly ship a different rule. In-memory doubles stay in `*-seeded.ts` modules
and are reachable only from tests.
*/
const requireDatabaseUrl = (config: ServerConfig, port: string): string => {
  if (config.issues.length > 0) {
    throw new Error(`Cannot create ${port} persistence for invalid config.`);
  }

  if (!config.databaseUrl) {
    throw new Error(`PostgreSQL ${port} persistence requires DATABASE_URL.`);
  }

  return config.databaseUrl;
};

/**
 * Identity persistence is a separate port from generation persistence: the identity boundary owns actors, bindings, memberships, and sessions, and the generation boundary owns drafts and attempts.
 */
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

  if (!config.databaseUrl) {
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

/**
The generated-pack port (#5). It is separate from the foundation port so the
publication context owns its tables and the generation context keeps its own
record.
*/
export const createPackPersistence = (config: ServerConfig): PackPersistence =>
  createPostgresPackPersistence(requireDatabaseUrl(config, "pack"));

/**
The versioned-record port (#112).
*/
export const createRecordPersistence = (
  config: ServerConfig
): RecordPersistence => {
  return createRecordCommands(
    createPostgresRecordBackend({
      databaseUrl: requireDatabaseUrl(config, "record"),
    })
  );
};

export {
  type PersistenceCheck,
  type FoundationPersistence,
  type FoundationPersistenceOptions,
} from "./persistence/types";
