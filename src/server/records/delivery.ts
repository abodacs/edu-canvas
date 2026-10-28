import { z } from "zod";

import {
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

export const nextActivitySchema = z
  .strictObject({ targetId: recordIdSchema })
  .nullable();

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

const decisionTargetIsValid = (decision: {
  action: (typeof teacherDecisionActionValues)[number];
  approvedTargetId: string | null;
}): boolean =>
  decision.action === "pause"
    ? decision.approvedTargetId === null
    : decision.approvedTargetId !== null;

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
  .refine(decisionTargetIsValid, {
    message: "Pause releases no target; accept and override require one.",
    path: ["approvedTargetId"],
  });

export type TeacherDecision = z.infer<typeof teacherDecisionSchema>;
