import type { ServerConfig } from "../config";
import type { SeedCounts } from "../seed-data";
import type { GenerationPersistence } from "../generation/types";
import type { SourcePersistence } from "../grounding/types";
import type { ServerObservability } from "../observability.server";

export interface PersistenceCheck {
  status: "ready" | "failed";
  kind: ServerConfig["mode"];
  code: "READY" | "CONFIG_INVALID" | "PERSISTENCE_UNAVAILABLE";
  message: string;
}

export interface FoundationPersistence
  extends GenerationPersistence, SourcePersistence {
  readonly kind: ServerConfig["mode"];
  check: () => Promise<PersistenceCheck>;
  readDemoCounts: () => Promise<SeedCounts>;
}

export interface FoundationPersistenceOptions {
  observability?: ServerObservability;
}
