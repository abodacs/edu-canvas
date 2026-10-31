import { and, desc, eq, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { sourceSnapshots } from "../../../drizzle/schema";
import type {
  SourceFailureReason,
  SourceFileFormat,
  SourceGap,
  SourceSnapshotState,
} from "@/shared/source-contract";
import type {
  SourcePersistence,
  SourceSnapshotRecord,
} from "../grounding/types";

/**
Drizzle-backed source persistence for the `drizzle` persistence adapter —
same behavior as the raw-SQL postgres backend, expressed through the schema
query builder (AgDR-0010).
*/

type DrizzleDatabase = ReturnType<typeof drizzle>;

const createClient = (databaseUrl: string) => {
  return postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 30,
    prepare: false,
  });
};

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : value;

const hydrate = (
  row: typeof sourceSnapshots.$inferSelect
): SourceSnapshotRecord => {
  return {
    id: row.id,
    tenantId: row.tenantId,
    teacherId: row.teacherId,
    standardId: row.standardId,
    mode: "upload",
    fileName: row.fileName,
    fileFormat: row.fileFormat as SourceFileFormat,
    fileSizeBytes: row.fileSizeBytes,
    pageCount: row.pageCount,
    contentHash: row.contentHash,
    extractedText: row.extractedText,
    state: row.state as SourceSnapshotState,
    gaps: Array.isArray(row.gaps) ? (row.gaps as SourceGap[]) : [],
    failureReason: row.failureReason as SourceFailureReason | null,
    unverifiedAlignment: row.unverifiedAlignment,
    alignmentAcknowledgedAt: row.alignmentAcknowledgedAt
      ? toIso(row.alignmentAcknowledgedAt)
      : null,
    syntheticMaterialConfirmed: row.syntheticMaterialConfirmed,
    requiredSkillsConfirmedAt: row.requiredSkillsConfirmedAt
      ? toIso(row.requiredSkillsConfirmedAt)
      : null,
    reviewedAt: row.reviewedAt ? toIso(row.reviewedAt) : null,
    usedAt: row.usedAt ? toIso(row.usedAt) : null,
    expiresAt: toIso(row.expiresAt),
    replacesSnapshotId: row.replacesSnapshotId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
};

const insertValues = (record: SourceSnapshotRecord) => {
  return {
    id: record.id,
    tenantId: record.tenantId,
    teacherId: record.teacherId,
    standardId: record.standardId,
    mode: record.mode,
    fileName: record.fileName,
    fileFormat: record.fileFormat,
    fileSizeBytes: record.fileSizeBytes,
    pageCount: record.pageCount,
    contentHash: record.contentHash,
    extractedText: record.extractedText,
    state: record.state,
    gaps: [...record.gaps],
    failureReason: record.failureReason,
    unverifiedAlignment: record.unverifiedAlignment,
    alignmentAcknowledgedAt: record.alignmentAcknowledgedAt,
    syntheticMaterialConfirmed: record.syntheticMaterialConfirmed,
    requiredSkillsConfirmedAt: record.requiredSkillsConfirmedAt,
    reviewedAt: record.reviewedAt,
    usedAt: record.usedAt,
    expiresAt: record.expiresAt,
    replacesSnapshotId: record.replacesSnapshotId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
};

const withClient = async <T>(
  databaseUrl: string,
  work: (database: DrizzleDatabase) => Promise<T>
): Promise<T> => {
  const database = drizzle(createClient(databaseUrl));
  try {
    return await work(database);
  } finally {
    await database.$client.end({ timeout: 3 });
  }
};

export const createDrizzleSourcePersistence = (
  databaseUrl: string
): SourcePersistence => {
  return {
    insertSnapshot: (record) => {
      return withClient(databaseUrl, async (database) => {
        await database.insert(sourceSnapshots).values(insertValues(record));
      });
    },

    updateSnapshot: (record, expectedUpdatedAt) => {
      return withClient(databaseUrl, async (database) => {
        const updated = await database
          .update(sourceSnapshots)
          .set({
            state: record.state,
            gaps: [...record.gaps],
            failureReason: record.failureReason,
            pageCount: record.pageCount,
            contentHash: record.contentHash,
            extractedText: record.extractedText,
            alignmentAcknowledgedAt: record.alignmentAcknowledgedAt,
            requiredSkillsConfirmedAt: record.requiredSkillsConfirmedAt,
            reviewedAt: record.reviewedAt,
            usedAt: record.usedAt,
            expiresAt: record.expiresAt,
            updatedAt: record.updatedAt,
          })
          .where(
            and(
              eq(sourceSnapshots.tenantId, record.tenantId),
              eq(sourceSnapshots.teacherId, record.teacherId),
              eq(sourceSnapshots.id, record.id),
              eq(sourceSnapshots.updatedAt, expectedUpdatedAt)
            )
          )
          .returning({ id: sourceSnapshots.id });
        return updated.length === 1;
      });
    },

    readSnapshot: (tenantId, teacherId, snapshotId) => {
      return withClient(databaseUrl, async (database) => {
        const rows = await database
          .select()
          .from(sourceSnapshots)
          .where(
            and(
              eq(sourceSnapshots.tenantId, tenantId),
              eq(sourceSnapshots.teacherId, teacherId),
              eq(sourceSnapshots.id, snapshotId)
            )
          )
          .limit(1);
        return rows.length === 0 ? undefined : hydrate(rows[0]);
      });
    },

    listSnapshots: (tenantId, teacherId) => {
      return withClient(databaseUrl, async (database) => {
        const rows = await database
          .select()
          .from(sourceSnapshots)
          .where(
            and(
              eq(sourceSnapshots.tenantId, tenantId),
              eq(sourceSnapshots.teacherId, teacherId)
            )
          )
          .orderBy(desc(sourceSnapshots.createdAt));
        return rows.map(hydrate);
      });
    },

    deleteSnapshot: (tenantId, teacherId, snapshotId) => {
      return withClient(databaseUrl, async (database) => {
        const deleted = await database
          .delete(sourceSnapshots)
          .where(
            and(
              eq(sourceSnapshots.tenantId, tenantId),
              eq(sourceSnapshots.teacherId, teacherId),
              eq(sourceSnapshots.id, snapshotId)
            )
          )
          .returning({ id: sourceSnapshots.id });
        return deleted.length === 1;
      });
    },

    expireSnapshotsBefore: (nowIso) => {
      return withClient(databaseUrl, async (database) => {
        const deleted = await database
          .delete(sourceSnapshots)
          .where(lt(sourceSnapshots.expiresAt, nowIso))
          .returning({ id: sourceSnapshots.id });
        return deleted.length;
      });
    },

    failStaleExtractingSnapshots: (staleBeforeIso, nowIso) => {
      return withClient(databaseUrl, async (database) => {
        const updated = await database
          .update(sourceSnapshots)
          .set({
            state: "failed",
            failureReason: "interrupted",
            extractedText: null,
            updatedAt: nowIso,
          })
          .where(
            and(
              eq(sourceSnapshots.state, "extracting"),
              lt(sourceSnapshots.updatedAt, staleBeforeIso)
            )
          )
          .returning({ id: sourceSnapshots.id });
        return updated.length;
      });
    },

    markSnapshotUsed: (
      tenantId,
      teacherId,
      snapshotId,
      usedAtIso,
      expiresAtIso
    ) => {
      return withClient(databaseUrl, async (database) => {
        const updated = await database
          .update(sourceSnapshots)
          .set({
            usedAt: usedAtIso,
            expiresAt: expiresAtIso,
            updatedAt: usedAtIso,
          })
          .where(
            and(
              eq(sourceSnapshots.tenantId, tenantId),
              eq(sourceSnapshots.teacherId, teacherId),
              eq(sourceSnapshots.id, snapshotId)
            )
          )
          .returning({ id: sourceSnapshots.id });
        return updated.length === 1;
      });
    },
  };
};
