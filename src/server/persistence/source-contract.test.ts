import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresPersistence } from "./postgres";
import {
  isRunDatabaseTests,
  requireDatabaseUrl,
  withTenantSql,
} from "./database-test-support";

import type { SourceSnapshotRecord } from "../grounding/types";
import type { FoundationPersistence } from "./types";

const runId = randomUUID();

interface TenantFixture {
  tenantId: string;
  teacherId: string;
  otherTeacherId: string;
  standardId: string;
}

const tenants: { primary?: TenantFixture } = {};

const createTenantFixture = async (suffix: string): Promise<TenantFixture> => {
  const tenantId = `tenant_issue_114_${suffix}_${runId}`;
  const teacherId = `actor_issue_114_${suffix}_${runId}`;
  const otherTeacherId = `actor_issue_114_${suffix}_other_${runId}`;
  const standardId = `standard_issue_114_${suffix}_${runId}`;
  await withTenantSql(tenantId, async (transaction) => {
    await transaction`
      insert into tenants (id, slug, name, synthetic_data_only)
      values (${tenantId}, ${tenantId}, ${"Issue 114 source fixture"}, true)
    `;
    await transaction`
      insert into actors (id, display_name)
      values
        (${teacherId}, ${"Issue 114 fixture teacher"}),
        (${otherTeacherId}, ${"Issue 114 other fixture teacher"})
    `;
    await transaction`
      insert into standards (
        id,
        tenant_id,
        code,
        name,
        subject,
        grade_band
      )
      values (
        ${standardId},
        ${tenantId},
        ${`ISSUE114-${suffix}`},
        ${"Issue 114 source standard"},
        ${"Mathematics"},
        ${"Grade 4"}
      )
    `;
  });
  return { tenantId, teacherId, otherTeacherId, standardId };
};

const deleteTenantFixture = async (fixture: TenantFixture): Promise<void> => {
  await withTenantSql(fixture.tenantId, async (transaction) => {
    await transaction`
      delete from source_snapshots where tenant_id = ${fixture.tenantId}
    `;
    await transaction`
      delete from standards where tenant_id = ${fixture.tenantId}
    `;
    await transaction`
      delete from actors
      where id in (${fixture.teacherId}, ${fixture.otherTeacherId})
    `;
    await transaction`delete from tenants where id = ${fixture.tenantId}`;
  });
};

const buildRecord = (
  fixture: TenantFixture,
  overrides: Partial<SourceSnapshotRecord> = {}
): SourceSnapshotRecord => {
  const timestamp = "2026-10-31T10:00:00.000Z";
  return {
    id: `snapshot_issue_114_${runId}`,
    tenantId: fixture.tenantId,
    teacherId: fixture.teacherId,
    standardId: fixture.standardId,
    mode: "upload",
    fileName: "equivalent-fractions.txt",
    fileFormat: "txt",
    fileSizeBytes: 120,
    pageCount: 1,
    contentHash: "a".repeat(64),
    extractedText: "Equivalent fractions name the same amount.",
    state: "complete",
    gaps: [
      {
        code: "unverified-external-alignment",
        message: "Upload recovery never claims a Learning Commons match.",
      },
    ],
    failureReason: null,
    unverifiedAlignment: true,
    alignmentAcknowledgedAt: null,
    syntheticMaterialConfirmed: true,
    requiredSkillsConfirmedAt: null,
    reviewedAt: null,
    usedAt: null,
    expiresAt: "2026-11-01T10:00:00.000Z",
    replacesSnapshotId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
};

describe.skipIf(!isRunDatabaseTests)(
  "source snapshot persistence contract (issue 114)",
  () => {
    let persistence: FoundationPersistence;

    beforeAll(async () => {
      persistence = createPostgresPersistence(requireDatabaseUrl());
      tenants.primary = await createTenantFixture("primary");
    });

    afterAll(async () => {
      if (tenants.primary) {
        await deleteTenantFixture(tenants.primary);
      }
    });

    it("round-trips a snapshot with gaps and text", async () => {
      const fixture = tenants.primary;
      if (!fixture) {
        throw new Error("Fixture missing.");
      }
      const record = buildRecord(fixture);
      await persistence.insertSnapshot(record);

      const stored = await persistence.readSnapshot(
        fixture.tenantId,
        fixture.teacherId,
        record.id
      );
      expect(stored).toEqual(record);

      const listed = await persistence.listSnapshots(
        fixture.tenantId,
        fixture.teacherId
      );
      expect(listed.map((entry) => entry.id)).toContain(record.id);
    });

    it("keeps teacher scoping: another teacher reads nothing", async () => {
      const fixture = tenants.primary;
      if (!fixture) {
        throw new Error("Fixture missing.");
      }
      const record = buildRecord(fixture, {
        id: `snapshot_issue_114_other_${runId}`,
      });
      await persistence.insertSnapshot(record);

      await expect(
        persistence.readSnapshot(
          fixture.tenantId,
          fixture.otherTeacherId,
          record.id
        )
      ).resolves.toBeUndefined();
      await expect(
        persistence.listSnapshots(fixture.tenantId, fixture.otherTeacherId)
      ).resolves.toEqual([]);
    });

    it("updates only against the expected timestamp and marks used once", async () => {
      const fixture = tenants.primary;
      if (!fixture) {
        throw new Error("Fixture missing.");
      }
      const record = buildRecord(fixture, {
        id: `snapshot_issue_114_cas_${runId}`,
      });
      await persistence.insertSnapshot(record);

      const reviewed: SourceSnapshotRecord = {
        ...record,
        reviewedAt: "2026-10-31T10:05:00.000Z",
        updatedAt: "2026-10-31T10:05:00.000Z",
      };
      await expect(
        persistence.updateSnapshot(reviewed, "2026-10-31T09:00:00.000Z")
      ).resolves.toBe(false);
      await expect(
        persistence.updateSnapshot(reviewed, record.updatedAt)
      ).resolves.toBe(true);

      await expect(
        persistence.markSnapshotUsed(
          fixture.tenantId,
          fixture.teacherId,
          record.id,
          "2026-10-31T10:06:00.000Z",
          "2026-11-07T10:06:00.000Z"
        )
      ).resolves.toBe(true);
      await expect(
        persistence.markSnapshotUsed(
          fixture.tenantId,
          fixture.teacherId,
          record.id,
          "2026-10-31T10:07:00.000Z",
          "2026-11-07T10:07:00.000Z"
        )
      ).resolves.toBe(false);

      const used = await persistence.readSnapshot(
        fixture.tenantId,
        fixture.teacherId,
        record.id
      );
      expect(used?.usedAt).toBe("2026-10-31T10:06:00.000Z");
      expect(used?.expiresAt).toBe("2026-11-07T10:06:00.000Z");
    });

    it("sweeps expired rows and stale extractions, then deletes", async () => {
      const fixture = tenants.primary;
      if (!fixture) {
        throw new Error("Fixture missing.");
      }
      const expiredRecord = buildRecord(fixture, {
        id: `snapshot_issue_114_expired_${runId}`,
        expiresAt: "2026-10-30T10:00:00.000Z",
      });
      const staleRecord = buildRecord(fixture, {
        id: `snapshot_issue_114_stale_${runId}`,
        state: "extracting",
        extractedText: null,
        contentHash: null,
        pageCount: null,
        updatedAt: "2026-10-31T09:00:00.000Z",
      });
      await persistence.insertSnapshot(expiredRecord);
      await persistence.insertSnapshot(staleRecord);

      await expect(
        persistence.expireSnapshotsBefore("2026-10-31T10:00:00.000Z")
      ).resolves.toBeGreaterThanOrEqual(1);
      await expect(
        persistence.failStaleExtractingSnapshots(
          "2026-10-31T09:30:00.000Z",
          "2026-10-31T10:00:00.000Z"
        )
      ).resolves.toBeGreaterThanOrEqual(1);

      const interrupted = await persistence.readSnapshot(
        fixture.tenantId,
        fixture.teacherId,
        staleRecord.id
      );
      expect(interrupted?.state).toBe("failed");
      expect(interrupted?.failureReason).toBe("interrupted");

      await expect(
        persistence.deleteSnapshot(
          fixture.tenantId,
          fixture.teacherId,
          staleRecord.id
        )
      ).resolves.toBe(true);
      await expect(
        persistence.readSnapshot(
          fixture.tenantId,
          fixture.teacherId,
          staleRecord.id
        )
      ).resolves.toBeUndefined();
    });
  }
);
