import { StandardGroundingUniqueViolationError } from "./standard-grounding-port";

import type { StandardGroundingRecord } from "../grounding/standards/types";
import type { StandardGroundingPersistence } from "./standard-grounding-port";

export interface SeededStandardGroundingStore {
  readonly records: Map<string, StandardGroundingRecord>;
}

export interface SeededStandardGroundingOptions {
  readonly store?: SeededStandardGroundingStore;
}

const recordKey = (tenantId: string, groundingId: string): string => {
  return `${tenantId}\0${groundingId}`;
};

const clone = (value: StandardGroundingRecord): StandardGroundingRecord => {
  return structuredClone(value);
};

export const createSeededStandardGroundingStore =
  (): SeededStandardGroundingStore => {
    return { records: new Map() };
  };

/**
In-memory test double for **Standard grounding**. It mirrors the append-only
port: insert only, tenant scoped reads, and a unique request key per tenant.
Runtime composition uses PostgreSQL; this module is never imported by runtime.
*/
export const createSeededStandardGroundingPersistence = (
  options: SeededStandardGroundingOptions = {}
): StandardGroundingPersistence => {
  const store = options.store ?? createSeededStandardGroundingStore();

  const forStandard = (
    tenantId: string,
    standard: { readonly jurisdiction: string; readonly statementCode: string }
  ): StandardGroundingRecord[] => {
    return store.records
      .values()
      .filter((record) => {
        return (
          record.tenantId === tenantId &&
          record.jurisdiction === standard.jurisdiction &&
          record.statementCode === standard.statementCode
        );
      })
      .toArray()
      .toSorted((left, right) => {
        return right.createdAt.localeCompare(left.createdAt);
      });
  };

  return {
    kind: "seeded-demo",
    check: () => Promise.resolve(true),

    insert: (record) => {
      const key = recordKey(record.tenantId, record.id);
      if (store.records.has(key)) {
        throw new StandardGroundingUniqueViolationError(
          "standard_groundings_tenant_id_id_key"
        );
      }
      const duplicateRequestKey = store.records.values().some((candidate) => {
        return (
          candidate.tenantId === record.tenantId &&
          candidate.requestKey === record.requestKey
        );
      });
      if (duplicateRequestKey) {
        throw new StandardGroundingUniqueViolationError(
          "standard_groundings_tenant_id_request_key_key"
        );
      }
      store.records.set(key, clone(record));
      return Promise.resolve();
    },

    read: (tenantId, groundingId) => {
      const record = store.records.get(recordKey(tenantId, groundingId));
      return Promise.resolve(record ? clone(record) : undefined);
    },

    readByRequestKey: (tenantId, requestKey) => {
      const record = store.records.values().find((candidate) => {
        return (
          candidate.tenantId === tenantId && candidate.requestKey === requestKey
        );
      });
      return Promise.resolve(record ? clone(record) : undefined);
    },

    readLatestForStandard: (tenantId, standard) => {
      const [latest] = forStandard(tenantId, standard);
      return Promise.resolve(latest ? clone(latest) : undefined);
    },

    history: (tenantId, standard) => {
      return Promise.resolve(forStandard(tenantId, standard).map(clone));
    },
  };
};
