import type { DemoCounts } from "@/shared/demo-contract";

import type { ServerConfig } from "../config";
import type { GenerationPersistence } from "../generation/types";
import type { ServerObservability } from "../observability.server";

export interface PersistenceCheck {
  status: "ready" | "failed";
  kind: ServerConfig["mode"];
  code: "READY" | "CONFIG_INVALID" | "PERSISTENCE_UNAVAILABLE";
  message: string;
}

export interface FoundationPersistence extends GenerationPersistence {
  readonly kind: ServerConfig["mode"];
  check: () => Promise<PersistenceCheck>;
  readDemoCounts: () => Promise<DemoCounts>;
}

export interface FoundationPersistenceOptions {
  observability?: ServerObservability;
}
