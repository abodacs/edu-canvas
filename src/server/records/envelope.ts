import { z } from "zod";

import { hashHexPattern } from "./hashes";
import { recordLimits } from "./vocabulary";

/**
 * Records use opaque text identifiers: UUIDv7 for new records, and the legacy fixture identifiers in the legacy decoders. The shape is deliberately wider than a UUID so a legacy label can still be read.
 */
export const recordIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,80}$/u, "This identifier is malformed.");

export const hashSchema = z.string().regex(hashHexPattern);

export const isoTimestampSchema = z.iso.datetime();

export const boundedTextSchema = (max: number) =>
  z.string().trim().min(1).max(max);

export const boundedListSchema = <T extends z.ZodType>(entry: T, max: number) =>
  z.array(entry).max(max);

export const recordEnvelopeShape = {
  id: recordIdSchema,
  tenantId: recordIdSchema,
  createdAt: isoTimestampSchema,
} as const;

export const recordEnvelopeSchema = z.strictObject(recordEnvelopeShape);

export type RecordEnvelope = z.infer<typeof recordEnvelopeSchema>;

export const revisionSchema = z
  .number()
  .int()
  .min(1)
  .max(recordLimits.revisionMax);

export const ordinalSchema = z
  .number()
  .int()
  .min(recordLimits.ordinalMin)
  .max(recordLimits.revisionMax);

export const scoreSchema = z
  .number()
  .int()
  .min(recordLimits.scoreMin)
  .max(recordLimits.scoreMax);
