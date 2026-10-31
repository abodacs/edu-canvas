import { generationClaimExpiredDiagnostic } from "../generation/types";
import { serverObservability } from "../observability.server";
import { getSyntheticSeedCounts } from "../seed-data";
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

  return {
    kind: inMemoryPersistenceKind,
    ...sourcePersistence,

    check() {
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

      return Promise.resolve({
        status: "ready",
        kind: inMemoryPersistenceKind,
        code: "READY",
        message: "Synthetic seed repository is loaded.",
      });
    },

    readSeedCounts() {
      try {
        return Promise.resolve(getSyntheticSeedCounts());
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

    claimGeneration(record) {
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
        return Promise.resolve({
          claimed: false,
          record: structuredClone(existing),
        });
      }

      generationStore.set(
        `${record.tenantId}:${record.requestId}`,
        structuredClone(record)
      );
      return Promise.resolve({
        claimed: true,
        record: structuredClone(record),
      });
    },

    expireGenerationClaim(tenantId, requestId, expectedUpdatedAt, updatedAt) {
      const key = `${tenantId}:${requestId}`;
      const existing = generationStore.get(key);
      if (
        !existing ||
        existing.state !== "generating" ||
        existing.updatedAt !== expectedUpdatedAt
      ) {
        return Promise.resolve(undefined);
      }

      const diagnostics = [
        ...existing.diagnostics,
        generationClaimExpiredDiagnostic(),
      ];
      const expired: LessonGenerationRecord = {
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
      generationStore.set(key, structuredClone(expired));
      return Promise.resolve(structuredClone(expired));
    },

    saveGeneration(record, expected) {
      const key = `${record.tenantId}:${record.requestId}`;
      const existing = generationStore.get(key);
      if (!existing || existing.state !== "generating") {
        return Promise.resolve(false);
      }
      if (
        existing.attempt !== expected.attempt ||
        existing.updatedAt !== expected.updatedAt
      ) {
        return Promise.resolve(false);
      }
      if (
        Date.parse(existing.updatedAt) <= Date.parse(expected.leaseValidAfter)
      ) {
        return Promise.resolve(false);
      }

      generationStore.set(key, structuredClone(record));
      return Promise.resolve(true);
    },

    findGenerationByIdempotencyKey(tenantId, teacherId, idempotencyKey) {
      const record = findStoredGenerationByIdempotencyKey(
        tenantId,
        teacherId,
        idempotencyKey
      );
      return Promise.resolve(record ? structuredClone(record) : undefined);
    },

    findModeratedGeneration(tenantId, teacherId, requestHash) {
      for (const record of generationStore.values()) {
        if (
          record.tenantId === tenantId &&
          record.teacherId === teacherId &&
          record.state === "blocked-by-moderation" &&
          record.attempts.some((attempt) => attempt.requestHash === requestHash)
        ) {
          return Promise.resolve(structuredClone(record));
        }
      }

      return Promise.resolve(undefined);
    },

    readGeneration(tenantId, requestId) {
      const record = generationStore.get(`${tenantId}:${requestId}`);
      return Promise.resolve(record ? structuredClone(record) : undefined);
    },
  };
};
