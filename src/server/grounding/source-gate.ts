import { SOURCE_USED_TTL_DAYS } from "@/shared/source-contract";

import { currentIso } from "./source-service";
import type { SourceGate, SourcePersistence } from "./types";

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const addDays = (iso: string, days: number): string => {
  const date = new Date(Date.parse(iso) + days * MS_PER_DAY);
  return date.toISOString();
};

/**
Persistence-backed generation gate (#114 build-order unit 3). A source blocks
generation unless it is complete, teacher-reviewed, and not expired. Generation
throws `GENERATION_SOURCE_NOT_READY` before its claim, so a blocked source
never burns an attempt.
*/
export const createPersistenceSourceGate = (
  persistence: SourcePersistence,
  clockNow: () => string = currentIso
): SourceGate => {
  return {
    resolveForGeneration: async (actor, sourceSnapshotId) => {
      const record = await persistence.readSnapshot(
        actor.tenantId,
        actor.teacherId,
        sourceSnapshotId
      );
      if (!record) {
        return {
          ok: false,
          message:
            "The attached source is not available. Reopen the source panel and pick the reviewed source again.",
        };
      }
      if (record.state !== "complete" || record.reviewedAt === null) {
        return {
          ok: false,
          message:
            "The attached source is not ready: incomplete extractions need corrected text or a replacement, and generation resumes only after teacher review.",
        };
      }
      if (Date.parse(record.expiresAt) <= Date.parse(clockNow())) {
        return {
          ok: false,
          message:
            "The attached source expired. Upload it again from the source panel.",
        };
      }
      return { ok: true, snapshotId: record.id };
    },

    markUsed: async (tenantId, teacherId, sourceSnapshotId, usedAtIso) => {
      await persistence.markSnapshotUsed(
        tenantId,
        teacherId,
        sourceSnapshotId,
        usedAtIso,
        addDays(usedAtIso, SOURCE_USED_TTL_DAYS)
      );
    },
  };
};
