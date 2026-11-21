import type { StandardGroundingRecord } from "../grounding/standards/types";

export interface StandardGroundingPersistence {
  readonly kind: "seeded-demo" | "postgres";
  readonly check: () => Promise<boolean>;
  readonly insert: (record: StandardGroundingRecord) => Promise<void>;
  readonly read: (
    tenantId: string,
    groundingId: string
  ) => Promise<StandardGroundingRecord | undefined>;
  readonly readByRequestKey: (
    tenantId: string,
    requestKey: string
  ) => Promise<StandardGroundingRecord | undefined>;
  readonly readLatestForStandard: (
    tenantId: string,
    standard: { readonly jurisdiction: string; readonly statementCode: string }
  ) => Promise<StandardGroundingRecord | undefined>;
  readonly history: (
    tenantId: string,
    standard: { readonly jurisdiction: string; readonly statementCode: string }
  ) => Promise<readonly StandardGroundingRecord[]>;
}

export class StandardGroundingUniqueViolationError extends Error {
  readonly constraint: string | undefined;

  constructor(constraint: string | undefined, options: ErrorOptions = {}) {
    super("A standard grounding already exists for this unique key.", options);
    this.name = "StandardGroundingUniqueViolationError";
    this.constraint = constraint;
  }
}
