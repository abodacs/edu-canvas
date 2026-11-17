import { generationClaimExpiredDiagnostic } from "../generation/types";
import { serverObservability } from "../observability.server";
import { getSyntheticSeedCounts } from "./seed-catalog";
import { inMemoryPersistenceKind } from "./kinds";
import { createSeededSourcePersistence } from "./source-seeded";
import type { FoundationPersistence } from "./types";
import type { SourceSnapshotRecord } from "../grounding/types";
import type { LessonGenerationRecord } from "../generation/types";
import type { ServerObservability } from "../observability.server";

export interface SeededPersistenceOptions {
  observability?: ServerObservability;
  generationStore?: Map<string, LessonGenerationRecord>;
  snapshotStore?: Map<string, SourceSnapshotRecord>;
}

const expireGenerationClaimRecord = (
  existing: LessonGenerationRecord | undefined,
  expectedUpdatedAt: string,
  updatedAt: string
): LessonGenerationRecord | undefined => {
  if (
    !existing ||
    existing.state !== "generating" ||
    existing.updatedAt !== expectedUpdatedAt
  ) {
    return undefined;
  }

  const diagnostics = [
    ...existing.diagnostics,
    generationClaimExpiredDiagnostic(),
  ];
  return {
    ...existing,
    state: "failed-retryable",
    diagnostics,
    updatedAt,
    attempts: existing.attempts.map((attempt) => {
      return attempt.attemptNumber === existing.attempt
        ? { ...attempt, state: "failed-retryable", diagnostics }
        : attempt;
    }),
  };
};

export const createSeededPersistence = (
  options: SeededPersistenceOptions = {}
): FoundationPersistence => {
  const observability = options.observability ?? serverObservability;
  const generationStore =
    options.generationStore ?? new Map<string, LessonGenerationRecord>();
  const sourcePersistence = createSeededSourcePersistence({
    snapshotStore: options.snapshotStore,
  });

  const findStoredGenerationByIdempotencyKey = (
    tenantId: string,
    teacherId: string,
    idempotencyKey: string
  ): LessonGenerationRecord | undefined => {
    for (const record of generationStore.values()) {
      if (
        record.tenantId === tenantId &&
        record.teacherId === teacherId &&
        record.attempts.some(
          (attempt) => attempt.idempotencyKey === idempotencyKey
        )
      ) {
        return record;
      }
    }

    return undefined;
  };

  const findModeratedGenerationRecord = (
    tenantId: string,
    teacherId: string,
    requestHash: string
  ): LessonGenerationRecord | undefined => {
    for (const record of generationStore.values()) {
      if (
        record.tenantId === tenantId &&
        record.teacherId === teacherId &&
        record.state === "blocked-by-moderation" &&
        record.attempts.some((attempt) => attempt.requestHash === requestHash)
      ) {
        return record;
      }
    }

    return undefined;
  };

  return {
    kind: inMemoryPersistenceKind,
    ...sourcePersistence,

    async check() {
      try {
        getSyntheticSeedCounts();
      } catch (error) {
        observability.captureError(error, {
          operation: "persistence.seeded.check",
          dependency: inMemoryPersistenceKind,
          reason: "seed_integrity_failed",
          code: "PERSISTENCE_UNAVAILABLE",
        });
        throw error;
      }

      return await Promise.resolve({
        status: "ready",
        kind: inMemoryPersistenceKind,
        code: "READY",
        message: "Synthetic seed repository is loaded.",
      });
    },

    async readSeedCounts() {
      try {
        return await Promise.resolve(getSyntheticSeedCounts());
      } catch (error) {
        observability.captureError(error, {
          operation: "persistence.seeded.read-seed-counts",
          dependency: inMemoryPersistenceKind,
          reason: "seed_integrity_failed",
          code: "PERSISTENCE_UNAVAILABLE",
        });
        throw error;
      }
    },

    async claimGeneration(record) {
      const attempt = record.attempts.at(-1);
      if (!attempt) {
        throw new Error("A generation claim requires an attempt.");
      }

      const existing = findStoredGenerationByIdempotencyKey(
        record.tenantId,
        record.teacherId,
        attempt.idempotencyKey
      );
      if (existing) {
        return await Promise.resolve({
          claimed: false,
          record: structuredClone(existing),
        });
      }

      generationStore.set(
        `${record.tenantId}:${record.requestId}`,
        structuredClone(record)
      );
      return {
        claimed: true,
        record: structuredClone(record),
      };
    },

    async expireGenerationClaim(
      tenantId,
      requestId,
      expectedUpdatedAt,
      updatedAt
    ) {
      const key = `${tenantId}:${requestId}`;
      const expired = expireGenerationClaimRecord(
        generationStore.get(key),
        expectedUpdatedAt,
        updatedAt
      );
      if (expired) {
        generationStore.set(key, structuredClone(expired));
      }
      return await Promise.resolve(
        expired ? structuredClone(expired) : undefined
      );
    },

    async saveGeneration(record, expected) {
      const key = `${record.tenantId}:${record.requestId}`;
      const existing = generationStore.get(key);
      if (!existing || existing.state !== "generating") {
        return await Promise.resolve(false);
      }
      if (
        existing.attempt !== expected.attempt ||
        existing.updatedAt !== expected.updatedAt
      ) {
        return false;
      }
      if (
        Date.parse(existing.updatedAt) <= Date.parse(expected.leaseValidAfter)
      ) {
        return false;
      }

      generationStore.set(key, structuredClone(record));
      return true;
    },

    async findGenerationByIdempotencyKey(tenantId, teacherId, idempotencyKey) {
      const record = findStoredGenerationByIdempotencyKey(
        tenantId,
        teacherId,
        idempotencyKey
      );
      return await Promise.resolve(
        record ? structuredClone(record) : undefined
      );
    },

    async findModeratedGeneration(tenantId, teacherId, requestHash) {
      const record = findModeratedGenerationRecord(
        tenantId,
        teacherId,
        requestHash
      );
      return await Promise.resolve(
        record ? structuredClone(record) : undefined
      );
    },

    async readGeneration(tenantId, requestId) {
      const record = generationStore.get(`${tenantId}:${requestId}`);
      return await Promise.resolve(
        record ? structuredClone(record) : undefined
      );
    },

    async writeAdvisoryReview(tenantId, requestId, review) {
      const key = `${tenantId}:${requestId}`;
      const existing = generationStore.get(key);
      if (!existing || existing.state !== "ready-for-review") {
        return await Promise.resolve(false);
      }
      // #223: additive only. The draft, state, diagnostics and gate stay as
      // they were; the advisory result rides in its own field.
      generationStore.set(
        key,
        structuredClone({ ...existing, advisoryReview: review })
      );
      return true;
    },
  };
};
