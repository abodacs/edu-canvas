import { z } from "zod";

import {
  boundedTextSchema,
  hashSchema,
  isoTimestampSchema,
  ordinalSchema,
  recordIdSchema,
  scoreSchema,
} from "./envelope";
import {
  assistanceKindValues,
  assistanceStateValues,
  correctnessValues,
  firstResponseStatusValues,
  nextActivityAxisValues,
  nextActivityPurposeValues,
  recordLimits,
  runStageValues,
  teacherDecisionActionValues,
} from "./vocabulary";

const progressRevisionSchema = z
  .number()
  .int()
  .min(0)
  .max(recordLimits.revisionMax);

export const assignmentSchema = z.strictObject({
  id: recordIdSchema,
  tenantId: recordIdSchema,
  schemaVersion: z.literal("assignment-v1"),
  publicationId: recordIdSchema,
  learnerId: recordIdSchema,
  assigningActorId: recordIdSchema,
  createdAt: isoTimestampSchema,
});

export type Assignment = z.infer<typeof assignmentSchema>;

const nextActivityDraftObject = z.strictObject({
  activityId: recordIdSchema.nullable(),
  activityAxis: z.enum(nextActivityAxisValues),
  purpose: z.enum(nextActivityPurposeValues),
  reason: boundedTextSchema(recordLimits.shortText),
  ruleVersion: boundedTextSchema(recordLimits.idLength),
  evidenceHash: hashSchema,
});

const hasValidActivityTarget = (activity: {
  readonly purpose: (typeof nextActivityPurposeValues)[number];
  readonly activityId: string | null;
}): boolean => {
  return activity.purpose === "pause"
    ? activity.activityId === null
    : activity.activityId !== null;
};

const targetMessage =
  "A paused decision carries no activity; every other decision names one.";

/**
The service supplies this draft; the record layer fills the attempt id.
*/
export const nextActivityDraftSchema = nextActivityDraftObject.refine(
  hasValidActivityTarget,
  { message: targetMessage, path: ["activityId"] }
);

export type NextActivityDraft = z.infer<typeof nextActivityDraftSchema>;

/**
#7: the deterministic next-activity decision stored on the run. `activityId`
names a variant in the same lesson version, never an item. A paused decision
carries no activity, so a reader cannot mistake a pause for a choice.
*/
export const nextActivitySchema = nextActivityDraftObject
  .extend({ derivedFromAttemptId: recordIdSchema.nullable() })
  .nullable()
  .refine((activity) => activity === null || hasValidActivityTarget(activity), {
    message: targetMessage,
    path: ["activityId"],
  });

export type NextActivity = z.infer<typeof nextActivitySchema>;

export const learnerRunSchema = z.strictObject({
  id: recordIdSchema,
  tenantId: recordIdSchema,
  schemaVersion: z.literal("learner-run-v1"),
  assignmentId: recordIdSchema,
  learnerId: recordIdSchema,
  publicationId: recordIdSchema,
  assignedVariantId: recordIdSchema,
  stage: z.enum(runStageValues),
  firstResponseStatus: z.enum(firstResponseStatusValues),
  revision: progressRevisionSchema,
  nextActivity: nextActivitySchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type LearnerRun = z.infer<typeof learnerRunSchema>;

export const assistanceEventSchema = z.strictObject({
  id: recordIdSchema,
  tenantId: recordIdSchema,
  schemaVersion: z.literal("assistance-event-v1"),
  runId: recordIdSchema,
  itemId: recordIdSchema,
  kind: z.enum(assistanceKindValues),
  ordinal: ordinalSchema,
  recordedAt: isoTimestampSchema,
});

export type AssistanceEvent = z.infer<typeof assistanceEventSchema>;

export const selectedPairSchema = z.strictObject({
  sourceId: recordIdSchema,
  targetId: recordIdSchema,
});

export type SelectedPair = z.infer<typeof selectedPairSchema>;

export const learnerAttemptSchema = z.strictObject({
  id: recordIdSchema,
  tenantId: recordIdSchema,
  schemaVersion: z.literal("attempt-v2"),
  runId: recordIdSchema,
  publicationId: recordIdSchema,
  lessonVersionId: recordIdSchema,
  itemId: recordIdSchema,
  ordinal: ordinalSchema,
  priorAttemptId: recordIdSchema.nullable(),
  selectedPairs: z.array(selectedPairSchema).max(recordLimits.itemMax),
  assistanceState: z.enum(assistanceStateValues),
  assistanceEventIds: z.array(recordIdSchema).max(recordLimits.listMax),
  score: scoreSchema,
  correctness: z.enum(correctnessValues),
  gradingRuleVersion: z.string().trim().min(1).max(recordLimits.idLength),
  createdAt: isoTimestampSchema,
});

export type LearnerAttempt = z.infer<typeof learnerAttemptSchema>;

const isDecisionTargetValid = (decision: {
  action: (typeof teacherDecisionActionValues)[number];
  approvedTargetId: string | null;
}): boolean => {
  return decision.action === "pause"
    ? decision.approvedTargetId === null
    : decision.approvedTargetId !== null;
};

export const teacherDecisionSchema = z
  .strictObject({
    id: recordIdSchema,
    tenantId: recordIdSchema,
    schemaVersion: z.literal("teacher-decision-v1"),
    runId: recordIdSchema,
    teacherActorId: recordIdSchema,
    evidenceHash: z.string().regex(/^[a-f0-9]{64}$/u),
    proposal: z.strictObject({
      ruleVersion: z.string().trim().min(1).max(recordLimits.idLength),
      summary: z.string().trim().min(1).max(recordLimits.summaryText),
    }),
    action: z.enum(teacherDecisionActionValues),
    approvedTargetId: recordIdSchema.nullable(),
    createdAt: isoTimestampSchema,
  })
  .refine(isDecisionTargetValid, {
    message: "Pause releases no target; accept and override require one.",
    path: ["approvedTargetId"],
  });

export type TeacherDecision = z.infer<typeof teacherDecisionSchema>;
