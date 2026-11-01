import { z } from "zod";

import {
  boundedTextSchema,
  hashSchema,
  isoTimestampSchema,
  recordIdSchema,
} from "./envelope";
import {
  recordActionValues,
  recordLimits,
  receiptResultKindValues,
} from "./vocabulary";

export const operationReceiptSchema = z.strictObject({
  id: recordIdSchema,
  tenantId: recordIdSchema,
  schemaVersion: z.literal("operation-receipt-v1"),
  actorId: recordIdSchema,
  membershipId: recordIdSchema,
  authorizationRevision: z.number().int().min(0),
  action: z.enum(recordActionValues),
  operationKey: boundedTextSchema(recordLimits.shortText),
  inputHash: hashSchema,
  resultKind: z.enum(receiptResultKindValues),
  resultIds: z
    .array(recordIdSchema)
    .min(1)
    .max(recordLimits.receiptResultIdMax),
  createdAt: isoTimestampSchema,
});

export type OperationReceipt = z.infer<typeof operationReceiptSchema>;
