import type { SeedCounts } from "../seed-data";
import type { GenerationPersistence } from "../generation/types";
import type { SourcePersistence } from "../grounding/types";
import type { ServerObservability } from "../observability.server";

import type { PersistenceKind } from "./kinds";

export type { PersistenceKind } from "./kinds";

export interface PersistenceCheck {
  status: "ready" | "failed";
  kind: PersistenceKind;
  code: "READY" | "CONFIG_INVALID" | "PERSISTENCE_UNAVAILABLE";
  message: string;
}

export interface FoundationPersistence
  extends GenerationPersistence, SourcePersistence {
  readonly kind: PersistenceKind;
  check: () => Promise<PersistenceCheck>;
  readSeedCounts: () => Promise<SeedCounts>;
}

export interface FoundationPersistenceOptions {
  observability?: ServerObservability;
}
