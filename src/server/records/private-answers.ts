import { z } from "zod";

import { recordIdSchema } from "./envelope";
import { recordLimits } from "./vocabulary";

export const privateAnswerRelationshipSchema = z.strictObject({
  itemId: recordIdSchema,
  correctTargetIds: z
    .array(recordIdSchema)
    .min(1)
    .max(recordLimits.answerTargetMax),
});

export const privateAnswerRelationshipsSchema = z
  .array(privateAnswerRelationshipSchema)
  .min(1)
  .max(recordLimits.answerRelationshipMax)
  .refine(
    (relationships) => {
      const items = new Set(relationships.map((entry) => entry.itemId));
      return items.size === relationships.length;
    },
    { message: "Each item may have one answer relationship." }
  );

export type PrivateAnswerRelationship = z.infer<
  typeof privateAnswerRelationshipSchema
>;
