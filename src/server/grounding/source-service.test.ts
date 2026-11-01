import { describe, expect, it } from "vitest";

import { syntheticSeed } from "@/server/seed-data";
import { parseTenantId } from "@/server/identity/identifiers";
import { syntheticTeacherActor } from "@/server/identity/test-actors";
import { SOURCE_MAX_EXTRACTED_CHARS } from "@/shared/source-contract";
import { createSeededSourcePersistence } from "../persistence/source-seeded";
import { createDefaultContentSafety } from "../moderation/content-safety";
import { createPersistenceSourceGate } from "./source-gate";
import { createSourceService } from "./source-service";
import { SourceRequestError } from "./types";

import type { PublicSourceSnapshot } from "@/shared/source-contract";

const teacherActor = syntheticTeacherActor({
  tenantId: parseTenantId(syntheticSeed.tenant.id),
});

const createService = (
  hasRequiredSkillPack?: (standardId: string, tenantId: string) => boolean
) => {
  return createSourceService({
    persistence: createSeededSourcePersistence(),
    safety: createDefaultContentSafety(),
    ...(hasRequiredSkillPack && { resolveStandardPack: hasRequiredSkillPack }),
    now: () => "2026-10-31T10:00:00.000Z",
    createSnapshotId: (() => {
      let sequence = 0;
      return () => {
        sequence += 1;
        return `snapshot_test_${sequence}`;
      };
    })(),
  });
};

const encoder = new TextEncoder();

const encodeSource = (value: string): Uint8Array => encoder.encode(value);

const TEXT_BYTES = encodeSource(
  "Equivalent fractions name the same amount.\nOne half equals two fourths."
);

describe(createSourceService, () => {
  it("extracts a clean text upload to a complete snapshot", async () => {
    const service = createService();
    const snapshot = await service.upload({
      actor: teacherActor,
      fileName: "notes.txt",
      bytes: TEXT_BYTES,
      syntheticMaterialConfirmed: true,
    });

    expect(snapshot.state).toBe("complete");
    expect(snapshot.fileFormat).toBe("txt");
    expect(snapshot.pageCount).toBe(1);
    expect(snapshot.gaps.map((gap) => gap.code)).toStrictEqual([
      "unverified-external-alignment",
    ]);
    expect([
      snapshot.extractedText?.includes("Equivalent fractions"),
      snapshot.reviewedAt,
    ]).toStrictEqual([true, null]);
  });

  it("rejects an upload without the synthetic-material confirmation", async () => {
    const service = createService();
    const failure = service.upload({
      actor: teacherActor,
      fileName: "notes.txt",
      bytes: TEXT_BYTES,
      syntheticMaterialConfirmed: false,
    });

    await expect(failure).rejects.toMatchObject({
      code: "SOURCE_INPUT_INVALID",
    });
  });

  it("rejects an unsupported format before creating a snapshot", async () => {
    const service = createService();
    const failure = service.upload({
      actor: teacherActor,
      fileName: "photo.pdf",
      bytes: encodeSource("not actually a pdf"),
      syntheticMaterialConfirmed: true,
    });

    await expect(failure).rejects.toMatchObject({
      code: "SOURCE_REJECTED",
    });
  });

  it("blocks a source that carries personal data and keeps no text", async () => {
    const service = createService();
    const rosterName = syntheticSeed.identities.find(
      (identity) => identity.role === "student"
    )?.displayName;
    const bytes = encodeSource(
      `Worksheet for ${rosterName}: reach me at guardian@example.com.`
    );
    const snapshot = await service.upload({
      actor: teacherActor,
      fileName: "roster.txt",
      bytes,
      syntheticMaterialConfirmed: true,
    });

    expect(snapshot.state).toBe("failed");
    expect(snapshot.failureReason).toBe("personal-data");
    expect(snapshot.extractedText).toBeNull();
  });

  it("marks a partial extraction with page numbers and blocks review", async () => {
    const service = createService();
    const scanned = await service.upload({
      actor: teacherActor,
      fileName: "scanned.txt",
      bytes: encodeSource("only page one has text"),
      syntheticMaterialConfirmed: true,
    });

    expect(scanned.state).toBe("complete");

    const missingPack = createService(() => false);
    const partial = await missingPack.upload({
      actor: teacherActor,
      fileName: "gapped.txt",
      bytes: encodeSource("readable but pack is missing"),
      syntheticMaterialConfirmed: true,
    });

    expect(partial.state).toBe("partial");
    expect(partial.gaps.map((gap) => gap.code)).toContain(
      "missing-prerequisites"
    );
    await expect(
      missingPack.review({
        actor: teacherActor,
        snapshotId: partial.id,
        input: { requiredSkillsConfirmed: true },
      })
    ).rejects.toMatchObject({ code: "SOURCE_REVIEW_FORBIDDEN" });
  });

  it("rejects corrected text over the character cap with the named reason", async () => {
    const service = createService();
    const failure = service.addCorrectedText({
      actor: teacherActor,
      correctedText: "a".repeat(SOURCE_MAX_EXTRACTED_CHARS + 1),
    });

    await expect(failure).rejects.toMatchObject({
      code: "SOURCE_REJECTED",
    });
  });

  it("creates a new reviewed snapshot from corrected text", async () => {
    const service = createService();
    const first = await service.upload({
      actor: teacherActor,
      fileName: "broken.txt",
      bytes: encodeSource("readable original"),
      syntheticMaterialConfirmed: true,
    });
    const repaired = await service.addCorrectedText({
      actor: teacherActor,
      correctedText: "corrected equivalent fractions text",
      replacesSnapshotId: first.id,
    });

    expect(repaired.state).toBe("complete");
    expect(repaired.replacesSnapshotId).toBe(first.id);
    expect(repaired.id).not.toBe(first.id);

    const reviewed = await service.review({
      actor: teacherActor,
      snapshotId: repaired.id,
      input: { requiredSkillsConfirmed: true, alignmentAcknowledged: true },
    });

    expect(reviewed.reviewedAt).not.toBeNull();
  });

  it("deletes a snapshot and keeps other teachers' rows", async () => {
    const service = createService();
    const snapshot = await service.upload({
      actor: teacherActor,
      fileName: "notes.txt",
      bytes: TEXT_BYTES,
      syntheticMaterialConfirmed: true,
    });
    await service.cancel(teacherActor, snapshot.id);

    await expect(service.read(teacherActor, snapshot.id)).rejects.toMatchObject(
      {
        code: "SOURCE_NOT_FOUND",
      }
    );
  });

  it("expires unused snapshots and marks stale extractions on cleanup", async () => {
    const persistence = createSeededSourcePersistence();
    const service = createSourceService({
      persistence,
      safety: createDefaultContentSafety(),
      now: () => "2026-10-31T10:00:00.000Z",
      createSnapshotId: () => "snapshot_cleanup",
    });
    await service.upload({
      actor: teacherActor,
      fileName: "notes.txt",
      bytes: TEXT_BYTES,
      syntheticMaterialConfirmed: true,
    });

    const expired = await service.runCleanup("2026-11-02T10:00:00.000Z");

    expect(expired.expired).toBe(1);
    await expect(
      service.read(teacherActor, "snapshot_cleanup")
    ).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });

    await persistence.insertSnapshot({
      id: "snapshot_stale",
      tenantId: teacherActor.tenantId,
      teacherId: teacherActor.actorId,
      standardId: syntheticSeed.standard.id,
      mode: "upload",
      fileName: "stale.txt",
      fileFormat: "txt",
      fileSizeBytes: 10,
      pageCount: null,
      contentHash: null,
      extractedText: null,
      state: "extracting",
      gaps: [],
      failureReason: null,
      unverifiedAlignment: true,
      alignmentAcknowledgedAt: null,
      syntheticMaterialConfirmed: true,
      requiredSkillsConfirmedAt: null,
      reviewedAt: null,
      usedAt: null,
      expiresAt: "2026-12-31T10:00:00.000Z",
      replacesSnapshotId: null,
      createdAt: "2026-10-31T09:00:00.000Z",
      updatedAt: "2026-10-31T09:00:00.000Z",
    });
    const stale = await service.runCleanup("2026-10-31T11:00:00.000Z");

    expect(stale.interrupted).toBe(1);

    const interrupted = await service.read(teacherActor, "snapshot_stale");

    expect([interrupted.state, interrupted.failureReason]).toStrictEqual([
      "failed",
      "interrupted",
    ]);
  });
});

const createGateWorld = async () => {
  const persistence = createSeededSourcePersistence();
  const service = createSourceService({
    persistence,
    safety: createDefaultContentSafety(),
    now: () => "2026-10-31T10:00:00.000Z",
  });
  const gate = createPersistenceSourceGate(
    persistence,
    () => "2026-10-31T10:00:00.000Z"
  );
  const snapshot: PublicSourceSnapshot = await service.upload({
    actor: teacherActor,
    fileName: "notes.txt",
    bytes: TEXT_BYTES,
    syntheticMaterialConfirmed: true,
  });
  return { persistence, gate, snapshot };
};

describe(createPersistenceSourceGate, () => {
  it("blocks an unreviewed source before the claim", async () => {
    const { gate, snapshot } = await createGateWorld();
    const resolution = await gate.resolveForGeneration(
      { tenantId: teacherActor.tenantId, teacherId: teacherActor.actorId },
      snapshot.id
    );

    expect(resolution.ok).toBeFalsy();
  });

  it("admits a reviewed source and marks it used with a seven-day expiry", async () => {
    const { persistence, gate, snapshot } = await createGateWorld();
    const reviewBase = await persistence.readSnapshot(
      teacherActor.tenantId,
      teacherActor.actorId,
      snapshot.id
    );

    if (!reviewBase) {
      throw new Error("The uploaded snapshot is missing from the store.");
    }

    expect(reviewBase.state).toBe("complete");

    await persistence.updateSnapshot(
      {
        ...reviewBase,
        reviewedAt: "2026-10-31T09:30:00.000Z",
        updatedAt: "2026-10-31T09:30:00.000Z",
      },
      reviewBase.updatedAt
    );

    const resolution = await gate.resolveForGeneration(
      { tenantId: teacherActor.tenantId, teacherId: teacherActor.actorId },
      snapshot.id
    );

    expect(resolution).toStrictEqual({ ok: true, snapshotId: snapshot.id });

    await gate.markUsed(
      teacherActor.tenantId,
      teacherActor.actorId,
      snapshot.id,
      "2026-10-31T10:00:00.000Z"
    );
    const stored = await persistence.readSnapshot(
      teacherActor.tenantId,
      teacherActor.actorId,
      snapshot.id
    );

    expect([stored?.usedAt, stored?.expiresAt]).toStrictEqual([
      "2026-10-31T10:00:00.000Z",
      "2026-11-07T10:00:00.000Z",
    ]);
  });

  it("names the reason when the source is missing", async () => {
    const { gate } = await createGateWorld();
    const resolution = await gate.resolveForGeneration(
      { tenantId: teacherActor.tenantId, teacherId: teacherActor.actorId },
      "snapshot_missing"
    );

    expect(resolution.ok).toBeFalsy();
  });
});

describe(SourceRequestError, () => {
  it("carries the shared status for its code", () => {
    const error = new SourceRequestError("not found", {
      code: "SOURCE_NOT_FOUND",
    });

    expect(error.status).toBe(404);
  });
});
