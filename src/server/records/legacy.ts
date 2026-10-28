import { z } from "zod";

import {
  hashSchema,
  isoTimestampSchema,
  ordinalSchema,
  recordIdSchema,
} from "./envelope";
import { recordLimits } from "./vocabulary";

/**
 * Decoders for the pre-versioning fixture rows. They return explicit legacy
 * labels and explicit nulls for approval and source evidence. They never infer
 * that an old activity was approved, grounded, or matched.
 */
export const legacyActivitySchema = z.strictObject({
  schemaVersion: z.literal("legacy-activity-v1"),
  id: recordIdSchema,
  tenantId: recordIdSchema,
  activityId: recordIdSchema,
  versionNumber: ordinalSchema,
  catalogVersion: z.string().trim().min(1).max(recordLimits.idLength),
  graphVersion: z.string().trim().min(1).max(recordLimits.idLength),
  publicContent: z.json(),
  privateAnswerPresent: z.boolean(),
  approval: z.null(),
  source: z.null(),
  immutableAt: isoTimestampSchema,
});

export type LegacyActivity = z.infer<typeof legacyActivitySchema>;

export interface LegacyActivityRow {
  readonly id: string;
  readonly tenantId: string;
  readonly activityId: string;
  readonly versionNumber: number;
  readonly catalogVersion: string;
  readonly graphVersion: string;
  readonly publicContent: unknown;
  readonly answerKey: unknown;
  readonly immutableAt: string;
}

export const decodeLegacyActivity = (row: LegacyActivityRow): LegacyActivity =>
  legacyActivitySchema.parse({
    schemaVersion: "legacy-activity-v1",
    id: row.id,
    tenantId: row.tenantId,
    activityId: row.activityId,
    versionNumber: row.versionNumber,
    catalogVersion: row.catalogVersion,
    graphVersion: row.graphVersion,
    publicContent: row.publicContent,
    privateAnswerPresent: row.answerKey !== null,
    approval: null,
    source: null,
    immutableAt: row.immutableAt,
  });

export const legacyAttemptSchema = z.strictObject({
  schemaVersion: z.literal("legacy-attempt-v1"),
  id: recordIdSchema,
  tenantId: recordIdSchema,
  activityVersionId: recordIdSchema,
  studentId: recordIdSchema,
  score: z.number().int().min(recordLimits.scoreMin).max(recordLimits.scoreMax),
  submittedAt: isoTimestampSchema.nullable(),
  createdAt: isoTimestampSchema,
  publication: z.null(),
  run: z.null(),
});

export type LegacyAttempt = z.infer<typeof legacyAttemptSchema>;

export interface LegacyAttemptRow {
  readonly id: string;
  readonly tenantId: string;
  readonly activityVersionId: string;
  readonly studentId: string;
  readonly score: number | null;
  readonly submittedAt: string | null;
  readonly createdAt: string;
}

export const decodeLegacyAttempt = (row: LegacyAttemptRow): LegacyAttempt =>
  legacyAttemptSchema.parse({
    schemaVersion: "legacy-attempt-v1",
    id: row.id,
    tenantId: row.tenantId,
    activityVersionId: row.activityVersionId,
    studentId: row.studentId,
    score: row.score ?? recordLimits.scoreMin,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    publication: null,
    run: null,
  });

export const legacyGenerationSchema = z.strictObject({
  schemaVersion: z.literal("legacy-generation-v1"),
  id: recordIdSchema,
  tenantId: recordIdSchema,
  state: z.string().trim().min(1).max(recordLimits.idLength),
  attempt: z.number().int().min(0),
  diagnostics: z.json(),
  contentHash: hashSchema.nullable(),
  approval: z.null(),
  source: z.null(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type LegacyGeneration = z.infer<typeof legacyGenerationSchema>;

export interface LegacyGenerationRow {
  readonly id: string;
  readonly tenantId: string;
  readonly state: string;
  readonly attempt: number;
  readonly diagnostics: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const decodeLegacyGeneration = (
  row: LegacyGenerationRow
): LegacyGeneration =>
  legacyGenerationSchema.parse({
    schemaVersion: "legacy-generation-v1",
    id: row.id,
    tenantId: row.tenantId,
    state: row.state,
    attempt: row.attempt,
    diagnostics: row.diagnostics,
    contentHash: null,
    approval: null,
    source: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
