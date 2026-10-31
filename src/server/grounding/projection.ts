import { SOURCE_REJECTION_MESSAGES } from "@/shared/source-contract";

import type {
  PublicSourceSnapshot,
  PublicSourceSnapshotSummary,
} from "@/shared/source-contract";
import type { SourceSnapshotRecord } from "./types";

/**
Public projections for source snapshots. The single-snapshot review view
carries the extracted text (the teacher's own material); list projections
never do.
*/
export const toPublicSourceSnapshot = (
  record: SourceSnapshotRecord,
  options: { readonly includeText: boolean }
): PublicSourceSnapshot => {
  return {
    id: record.id,
    mode: record.mode,
    fileName: record.fileName,
    fileFormat: record.fileFormat,
    fileSizeBytes: record.fileSizeBytes,
    pageCount: record.pageCount,
    state: record.state,
    gaps: record.gaps.map((gap) => ({ ...gap })),
    failureReason: record.failureReason,
    failureMessage:
      record.failureReason === null
        ? null
        : SOURCE_REJECTION_MESSAGES[record.failureReason],
    unverifiedAlignment: record.unverifiedAlignment,
    alignmentAcknowledgedAt: record.alignmentAcknowledgedAt,
    reviewedAt: record.reviewedAt,
    usedAt: record.usedAt,
    expiresAt: record.expiresAt,
    replacesSnapshotId: record.replacesSnapshotId,
    extractedText: options.includeText ? record.extractedText : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
};

export const toPublicSourceSnapshotSummary = (
  record: SourceSnapshotRecord
): PublicSourceSnapshotSummary => {
  const projection = toPublicSourceSnapshot(record, { includeText: false });
  return { ...projection, extractedText: null };
};
