import type {
  SourcePersistence,
  SourceSnapshotRecord,
} from "../grounding/types";

export interface SeededSourcePersistenceOptions {
  snapshotStore?: Map<string, SourceSnapshotRecord>;
}

const snapshotKey = (tenantId: string, snapshotId: string): string =>
  `${tenantId}:${snapshotId}`;

/**
In-memory source persistence for tests. Mirrors the postgres backend's tenant and teacher scoping so the test double behaves identically.
*/
export const createSeededSourcePersistence = (
  options: SeededSourcePersistenceOptions = {}
): SourcePersistence => {
  const store =
    options.snapshotStore ?? new Map<string, SourceSnapshotRecord>();

  const findOwned = (
    tenantId: string,
    teacherId: string,
    snapshotId: string
  ): SourceSnapshotRecord | undefined => {
    const record = store.get(snapshotKey(tenantId, snapshotId));
    return record && record.teacherId === teacherId ? record : undefined;
  };

  return {
    async insertSnapshot(record) {
      store.set(
        snapshotKey(record.tenantId, record.id),
        structuredClone(record)
      );
      await Promise.resolve();
    },

    async updateSnapshot(record, expectedUpdatedAt) {
      const existing = findOwned(record.tenantId, record.teacherId, record.id);
      if (!existing || existing.updatedAt !== expectedUpdatedAt) {
        return await Promise.resolve(false);
      }
      store.set(
        snapshotKey(record.tenantId, record.id),
        structuredClone(record)
      );
      return true;
    },

    async readSnapshot(tenantId, teacherId, snapshotId) {
      const record = findOwned(tenantId, teacherId, snapshotId);
      return await Promise.resolve(
        record ? structuredClone(record) : undefined
      );
    },

    async listSnapshots(tenantId, teacherId) {
      const records = store
        .values()
        .filter(
          (record) =>
            record.tenantId === tenantId && record.teacherId === teacherId
        )
        .toArray()
        .toSorted((left, right) =>
          right.createdAt.localeCompare(left.createdAt)
        );
      return await Promise.resolve(
        records.map((record) => structuredClone(record))
      );
    },

    async deleteSnapshot(tenantId, teacherId, snapshotId) {
      const existing = findOwned(tenantId, teacherId, snapshotId);
      if (!existing) {
        return await Promise.resolve(false);
      }
      store.delete(snapshotKey(tenantId, snapshotId));
      return true;
    },

    async expireSnapshotsBefore(nowIso) {
      let expired = 0;
      for (const [key, record] of store) {
        if (Date.parse(record.expiresAt) >= Date.parse(nowIso)) {
          continue;
        }

        store.delete(key);
        expired += 1;
      }
      return await Promise.resolve(expired);
    },

    async failStaleExtractingSnapshots(staleBeforeIso, nowIso) {
      let interrupted = 0;
      for (const [key, record] of store) {
        if (!(
          record.state === "extracting" &&
          Date.parse(record.updatedAt) < Date.parse(staleBeforeIso)
        )) {
          continue;
        }

        store.set(key, {
          ...record,
          state: "failed",
          failureReason: "interrupted",
          extractedText: null,
          updatedAt: nowIso,
        });
        interrupted += 1;
      }
      return await Promise.resolve(interrupted);
    },

    async markSnapshotUsed(
      tenantId,
      teacherId,
      snapshotId,
      usedAtIso,
      expiresAtIso
    ) {
      const existing = findOwned(tenantId, teacherId, snapshotId);
      if (!existing || existing.usedAt !== null) {
        return await Promise.resolve(false);
      }
      store.set(snapshotKey(tenantId, snapshotId), {
        ...existing,
        usedAt: usedAtIso,
        expiresAt: expiresAtIso,
        updatedAt: usedAtIso,
      });
      return true;
    },
  };
};
