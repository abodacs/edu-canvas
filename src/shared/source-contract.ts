import { z } from "zod";

/**
Shared, browser-safe contract for bounded source snapshots (#114). The server
delivery seam parses responses with these schemas; the studio renders the same
gap vocabulary the server persisted. Raw extracted text is the teacher's own
tenant-scoped material and is only returned for the single-snapshot review
view, never in list projections.
*/

export const SOURCE_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const SOURCE_MAX_PDF_PAGES = 20;
export const SOURCE_MAX_EXTRACTED_CHARS = 30_000;
export const SOURCE_EXTRACTION_TIMEOUT_MS = 10_000;
export const SOURCE_EXTRACTION_WORKER_MEMORY_MB = 128;
export const SOURCE_UNUSED_TTL_HOURS = 24;
export const SOURCE_USED_TTL_DAYS = 7;

export const sourceModeValues = ["upload"] as const;
export const sourceFileFormatValues = ["pdf", "txt", "markdown"] as const;
export const sourceSnapshotStateValues = [
  "extracting",
  "complete",
  "partial",
  "failed",
] as const;

/**
Three gap families stay distinguishable, per the issue contract: missing
prerequisites, extraction faults (`scanned-page`, `broken-math`, `encoding`,
`parser-fault`), and unverified external alignment. Upload snapshots always
carry the alignment notice because no upload can claim a Learning Commons
match.
*/
export const sourceGapCodeValues = [
  "missing-prerequisites",
  "scanned-page",
  "broken-math",
  "encoding",
  "parser-fault",
  "unverified-external-alignment",
] as const;

/**
Named reasons a snapshot can fail with. Response-level rejections
(`oversized-file`, `unsupported-format`, `encrypted` pre-scan) happen before a
snapshot exists; the others finalize a `failed` snapshot the teacher can
repair from.
*/
export const sourceFailureReasonValues = [
  "unsupported-format",
  "oversized-file",
  "too-many-pages",
  "encrypted",
  "empty-source",
  "encoding",
  "character-limit-exceeded",
  "parser-fault",
  "extraction-timeout",
  "interrupted",
  "personal-data",
] as const;

export const SOURCE_REJECTION_MESSAGES: Record<
  (typeof sourceFailureReasonValues)[number],
  string
> = {
  "unsupported-format":
    "That file type is not supported. Use a selectable-text PDF, TXT, or Markdown file.",
  "oversized-file":
    "That file is larger than 5 MiB. Remove scans or split the document, then try again.",
  "too-many-pages":
    "That document has more than 20 pages. Split it or upload only the pages you need.",
  encrypted:
    "That file is password-protected. Remove the password protection, then try again.",
  "empty-source":
    "No readable text was found. A scanned document needs corrected text instead.",
  encoding:
    "The file is not valid UTF-8 text. Save it as UTF-8, or paste corrected text.",
  "character-limit-exceeded":
    "The extracted text is longer than 30,000 characters. Upload fewer pages or paste corrected text.",
  "parser-fault":
    "The document could not be read. Try a replacement file, or paste corrected text.",
  "extraction-timeout":
    "Reading the file took too long. Try a replacement file, or paste corrected text.",
  interrupted:
    "Extraction was interrupted before it finished. Start the upload again.",
  "personal-data":
    "Personal data was detected, so the source was not kept. Replace any student names, emails, or identifiers, then upload again.",
};

export const sourceGapSchema = z
  .object({
    code: z.enum(sourceGapCodeValues),
    pages: z.array(z.number().int().min(1)).optional(),
    message: z.string(),
  })
  .strict();

export const publicSourceSnapshotSchema = z
  .object({
    id: z.string(),
    mode: z.enum(sourceModeValues),
    fileName: z.string(),
    fileFormat: z.enum(sourceFileFormatValues),
    fileSizeBytes: z.number().int().min(0),
    pageCount: z.number().int().min(1).nullable(),
    state: z.enum(sourceSnapshotStateValues),
    gaps: z.array(sourceGapSchema),
    failureReason: z.enum(sourceFailureReasonValues).nullable(),
    failureMessage: z.string().nullable(),
    unverifiedAlignment: z.boolean(),
    alignmentAcknowledgedAt: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    usedAt: z.string().nullable(),
    expiresAt: z.string(),
    replacesSnapshotId: z.string().nullable(),
    extractedText: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export const publicSourceSnapshotSummarySchema = publicSourceSnapshotSchema
  .omit({ extractedText: true })
  .extend({ extractedText: z.null() })
  .strict();

export type SourceGap = z.infer<typeof sourceGapSchema>;
export type PublicSourceSnapshot = z.infer<typeof publicSourceSnapshotSchema>;
export type PublicSourceSnapshotSummary = z.infer<
  typeof publicSourceSnapshotSummarySchema
>;
export type SourceSnapshotState = (typeof sourceSnapshotStateValues)[number];
export type SourceFileFormat = (typeof sourceFileFormatValues)[number];
export type SourceFailureReason = (typeof sourceFailureReasonValues)[number];

const sourceIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,80}$/u);

export const correctedSourceTextSchema = z
  .object({
    correctedText: z.string().min(1).max(SOURCE_MAX_EXTRACTED_CHARS),
    replacesSnapshotId: sourceIdSchema.optional(),
  })
  .strict();

export const sourceReviewInputSchema = z
  .object({
    requiredSkillsConfirmed: z.boolean(),
    alignmentAcknowledged: z.boolean().optional(),
  })
  .strict();

export type CorrectedSourceTextInput = z.infer<
  typeof correctedSourceTextSchema
>;
export type SourceReviewInput = z.infer<typeof sourceReviewInputSchema>;

/**
Stable machine codes the source delivery seam rejects requests with, following
the seam conventions in the generation contract (`INVALID_INPUT`-family 422,
conflict-family 409, `NOT_FOUND` 404). `SOURCE_REJECTED` carries a named
reason from `sourceFailureReasonValues` for rejections that happen before a
snapshot exists.
*/
export const sourceRequestErrorCodeValues = [
  "SOURCE_INPUT_INVALID",
  "SOURCE_NOT_FOUND",
  "SOURCE_REJECTED",
  "SOURCE_REVIEW_FORBIDDEN",
  "SOURCE_STATE_CONFLICT",
] as const;

export type SourceRequestErrorCode =
  (typeof sourceRequestErrorCodeValues)[number];

export const sourceRequestErrorStatusByCode = {
  SOURCE_INPUT_INVALID: 422,
  SOURCE_NOT_FOUND: 404,
  SOURCE_REJECTED: 422,
  SOURCE_REVIEW_FORBIDDEN: 409,
  SOURCE_STATE_CONFLICT: 409,
} as const satisfies Record<SourceRequestErrorCode, number>;
