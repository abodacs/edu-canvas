import { createId } from "@/server/ids";
import { demoSeed } from "@/server/seed-data";
import {
  SOURCE_MAX_EXTRACTED_CHARS,
  SOURCE_UNUSED_TTL_HOURS,
  SOURCE_REJECTION_MESSAGES,
} from "@/shared/source-contract";

import { startBoundedExtraction } from "./extraction";

import {
  countCodePoints,
  decideExtractedLength,
  decideFileFormat,
  decideFileSize,
  decidePageCount,
  decidePageGaps,
  hasPdfEncryptionMarker,
  hashExtractedText,
  missingPrerequisitesGap,
  unverifiedAlignmentGap,
} from "./ingestion";
import {
  toPublicSourceSnapshot,
  toPublicSourceSnapshotSummary,
} from "./projection";
import { SourceRequestError } from "./types";
import type { ExtractionOutcome } from "./extraction";
import type {
  PublicSourceSnapshot,
  PublicSourceSnapshotSummary,
  SourceGap,
  SourceReviewInput,
} from "@/shared/source-contract";

import type {
  CorrectedTextCommand,
  SourceCleanupResult,
  SourceService,
  SourceServiceOptions,
  SourceSnapshotRecord,
  SourceUploadCommand,
} from "./types";

const MS_PER_HOUR = 3_600_000;

/**
An `extracting` snapshot left behind by a crashed process is marked failed
after this long; live extractions finish in at most 10 seconds.
*/
const STALE_EXTRACTION_AFTER_MS = 60_000;

const CORRECTED_TEXT_FORMAT = "markdown" as const;
const CORRECTED_TEXT_FILE_NAME = "corrected-source.md";

const TEXT_ENCODER = new TextEncoder();

export const currentIso = (): string => {
  const date = new Date();
  return date.toISOString();
};

const addHours = (iso: string, hours: number): string => {
  const date = new Date(Date.parse(iso) + hours * MS_PER_HOUR);
  return date.toISOString();
};

const effectiveStandardId = (): string => demoSeed.standard.id;

export const createSourceService = (
  options: SourceServiceOptions
): SourceService => {
  const { persistence, safety } = options;
  const now = options.now ?? currentIso;
  const createSnapshotId = options.createSnapshotId ?? createId;
  const activeExtractions = new Map<string, () => void>();

  const readOwned = async (
    tenantId: string,
    teacherId: string,
    snapshotId: string
  ): Promise<SourceSnapshotRecord> => {
    const record = await persistence.readSnapshot(
      tenantId,
      teacherId,
      snapshotId
    );
    if (!record) {
      throw new SourceRequestError("The source snapshot was not found.", {
        code: "SOURCE_NOT_FOUND",
      });
    }
    return record;
  };

  const persistUpdate = async (
    record: SourceSnapshotRecord,
    patch: Partial<SourceSnapshotRecord>
  ): Promise<SourceSnapshotRecord> => {
    const updated: SourceSnapshotRecord = {
      ...record,
      ...patch,
      updatedAt: now(),
    };
    const owned = await persistence.updateSnapshot(updated, record.updatedAt);
    if (!owned) {
      throw new SourceRequestError(
        "The source changed while it was being read. Review the current state.",
        { code: "SOURCE_STATE_CONFLICT" }
      );
    }
    return updated;
  };

  const startSnapshot = async (
    actor: CorrectedTextCommand["actor"],
    base: {
      readonly fileName: string;
      readonly fileFormat: SourceSnapshotRecord["fileFormat"];
      readonly fileSizeBytes: number;
      readonly replacesSnapshotId: string | null;
    }
  ): Promise<SourceSnapshotRecord> => {
    const timestamp = now();
    const record: SourceSnapshotRecord = {
      id: createSnapshotId(),
      tenantId: actor.tenantId,
      teacherId: actor.actorId,
      standardId: effectiveStandardId(),
      mode: "upload",
      fileName: base.fileName,
      fileFormat: base.fileFormat,
      fileSizeBytes: base.fileSizeBytes,
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
      expiresAt: addHours(timestamp, SOURCE_UNUSED_TTL_HOURS),
      replacesSnapshotId: base.replacesSnapshotId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await persistence.insertSnapshot(record);
    return record;
  };

  const assertReplacementOwnership = async (
    actor: CorrectedTextCommand["actor"],
    replacesSnapshotId: string | undefined
  ): Promise<string | null> => {
    if (!replacesSnapshotId) {
      return null;
    }
    await readOwned(actor.tenantId, actor.actorId, replacesSnapshotId);
    return replacesSnapshotId;
  };

  const finalizeExtraction = (
    record: SourceSnapshotRecord,
    outcome: ExtractionOutcome
  ): Promise<SourceSnapshotRecord> => {
    if (!outcome.ok) {
      return persistUpdate(record, {
        state: "failed",
        failureReason: outcome.reason,
        gaps: [],
        extractedText: null,
      });
    }

    const { pages } = outcome;
    const pageCountDecision = decidePageCount(pages.length);
    if (!pageCountDecision.ok) {
      return persistUpdate(record, {
        state: "failed",
        failureReason: pageCountDecision.reason,
        gaps: [],
        extractedText: null,
        pageCount: pages.length,
      });
    }

    const text = pages.join("\n\n");
    const lengthDecision = decideExtractedLength(text);
    if (!lengthDecision.ok) {
      return persistUpdate(record, {
        state: "failed",
        failureReason: lengthDecision.reason,
        gaps: [],
        extractedText: null,
        pageCount: pageCountDecision.value,
      });
    }

    if (text.trim().length === 0) {
      return persistUpdate(record, {
        state: "failed",
        failureReason: "empty-source",
        gaps: [],
        extractedText: null,
        pageCount: pageCountDecision.value,
      });
    }

    if (!safety.checkSourceText(text).allowed) {
      return persistUpdate(record, {
        state: "failed",
        failureReason: "personal-data",
        gaps: [],
        extractedText: null,
        contentHash: hashExtractedText(text),
        pageCount: pageCountDecision.value,
      });
    }

    const pageGaps = decidePageGaps(pages);
    const packAvailable =
      options.resolveStandardPack?.(record.standardId, record.tenantId) ?? true;
    const gaps: SourceGap[] = [
      ...pageGaps,
      ...(packAvailable ? [] : [missingPrerequisitesGap()]),
      unverifiedAlignmentGap(),
    ];
    const state =
      !packAvailable || pageGaps.length > 0 ? "partial" : "complete";

    return persistUpdate(record, {
      state,
      gaps,
      extractedText: text,
      contentHash: hashExtractedText(text),
      pageCount: pageCountDecision.value,
      failureReason: null,
    });
  };

  const upload = async (
    command: SourceUploadCommand
  ): Promise<PublicSourceSnapshot> => {
    const { actor, fileName, bytes } = command;
    if (!command.syntheticMaterialConfirmed) {
      throw new SourceRequestError(
        "Confirm the material is synthetic before uploading.",
        { code: "SOURCE_INPUT_INVALID" }
      );
    }

    const sizeDecision = decideFileSize(bytes);
    if (!sizeDecision.ok) {
      throw new SourceRequestError(
        SOURCE_REJECTION_MESSAGES[sizeDecision.reason],
        { code: "SOURCE_REJECTED" }
      );
    }
    const formatDecision = decideFileFormat(fileName, bytes);
    if (!formatDecision.ok) {
      throw new SourceRequestError(
        SOURCE_REJECTION_MESSAGES[formatDecision.reason],
        { code: "SOURCE_REJECTED" }
      );
    }
    if (formatDecision.value === "pdf" && hasPdfEncryptionMarker(bytes)) {
      throw new SourceRequestError(SOURCE_REJECTION_MESSAGES.encrypted, {
        code: "SOURCE_REJECTED",
      });
    }

    const replacesSnapshotId = await assertReplacementOwnership(
      actor,
      command.replacesSnapshotId
    );
    const record = await startSnapshot(actor, {
      fileName,
      fileFormat: formatDecision.value,
      fileSizeBytes: sizeDecision.value,
      replacesSnapshotId,
    });

    const extraction = startBoundedExtraction(bytes, formatDecision.value);
    activeExtractions.set(record.id, extraction.cancel);
    const outcome = await extraction.promise;
    activeExtractions.delete(record.id);

    const finalized = await finalizeExtraction(record, outcome);
    return toPublicSourceSnapshot(finalized, { includeText: true });
  };

  const addCorrectedText = async (
    command: CorrectedTextCommand
  ): Promise<PublicSourceSnapshot> => {
    if (countCodePoints(command.correctedText) > SOURCE_MAX_EXTRACTED_CHARS) {
      throw new SourceRequestError(
        SOURCE_REJECTION_MESSAGES["character-limit-exceeded"],
        { code: "SOURCE_REJECTED" }
      );
    }

    const replacesSnapshotId = await assertReplacementOwnership(
      command.actor,
      command.replacesSnapshotId
    );
    const record = await startSnapshot(command.actor, {
      fileName: CORRECTED_TEXT_FILE_NAME,
      fileFormat: CORRECTED_TEXT_FORMAT,
      fileSizeBytes: TEXT_ENCODER.encode(command.correctedText).byteLength,
      replacesSnapshotId,
    });

    const finalized = await finalizeExtraction(record, {
      ok: true,
      pages: [command.correctedText],
    });
    return toPublicSourceSnapshot(finalized, { includeText: true });
  };

  const list = async (
    actor: CorrectedTextCommand["actor"]
  ): Promise<PublicSourceSnapshotSummary[]> => {
    const records = await persistence.listSnapshots(
      actor.tenantId,
      actor.actorId
    );
    return records.map(toPublicSourceSnapshotSummary);
  };

  const read = async (
    actor: CorrectedTextCommand["actor"],
    snapshotId: string
  ): Promise<PublicSourceSnapshot> => {
    const record = await readOwned(actor.tenantId, actor.actorId, snapshotId);
    return toPublicSourceSnapshot(record, { includeText: true });
  };

  const cancel = async (
    actor: CorrectedTextCommand["actor"],
    snapshotId: string
  ): Promise<void> => {
    await readOwned(actor.tenantId, actor.actorId, snapshotId);
    const cancelExtraction = activeExtractions.get(snapshotId);
    if (cancelExtraction) {
      activeExtractions.delete(snapshotId);
      cancelExtraction();
    }
    await persistence.deleteSnapshot(actor.tenantId, actor.actorId, snapshotId);
  };

  const review = async (command: {
    readonly actor: CorrectedTextCommand["actor"];
    readonly snapshotId: string;
    readonly input: SourceReviewInput;
  }): Promise<PublicSourceSnapshot> => {
    const record = await readOwned(
      command.actor.tenantId,
      command.actor.actorId,
      command.snapshotId
    );
    if (record.state === "extracting") {
      throw new SourceRequestError("The source is still being read.", {
        code: "SOURCE_REVIEW_FORBIDDEN",
      });
    }
    if (record.state !== "complete") {
      throw new SourceRequestError(
        "Repair the source before review: enter corrected text or replace the file.",
        { code: "SOURCE_REVIEW_FORBIDDEN" }
      );
    }
    if (!command.input.requiredSkillsConfirmed) {
      throw new SourceRequestError(
        "Confirm the source covers the required skills before review.",
        { code: "SOURCE_INPUT_INVALID" }
      );
    }

    const timestamp = now();
    const finalized = await persistUpdate(record, {
      reviewedAt: timestamp,
      requiredSkillsConfirmedAt: timestamp,
      ...(command.input.alignmentAcknowledged && {
        alignmentAcknowledgedAt: timestamp,
      }),
    });
    return toPublicSourceSnapshot(finalized, { includeText: true });
  };

  const runCleanup = async (
    sweepStartedAt: string
  ): Promise<SourceCleanupResult> => {
    const expired = await persistence.expireSnapshotsBefore(sweepStartedAt);
    const staleDate = new Date(
      Date.parse(sweepStartedAt) - STALE_EXTRACTION_AFTER_MS
    );
    const staleBefore = staleDate.toISOString();
    const interrupted = await persistence.failStaleExtractingSnapshots(
      staleBefore,
      sweepStartedAt
    );
    return { expired, interrupted };
  };

  return {
    upload,
    addCorrectedText,
    list,
    read,
    cancel,
    review,
    runCleanup,
  };
};
