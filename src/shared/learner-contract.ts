import { z } from "zod";

// The published learner contract. `GET /api/learner/runs` and
// `POST /api/learner/attempts` return these shapes, and the `/learn` page
// parses them again on arrival, so a renamed field fails on both sides.
// Storage schemas stay stricter and server-side.

export const sectionKindValues = [
  "worked-example",
  "guided-practice",
  "independent-check",
  "follow-up",
] as const;

export const runStageValues = [
  "assigned",
  "active",
  "awaiting-decision",
  "paused",
  "advanced",
  "completed",
] as const;

export const firstResponseStatusValues = ["pending", "submitted"] as const;

export const correctnessValues = ["correct", "partial", "incorrect"] as const;

export const nextActivityPurposeValues = [
  "pause",
  "scaffold",
  "standard",
  "challenge",
  "teacher-choice",
] as const;

export const nextActivityAxisValues = ["variant-kind"] as const;

export type SectionKind = (typeof sectionKindValues)[number];
export type RunStage = (typeof runStageValues)[number];
export type FirstResponseStatus = (typeof firstResponseStatusValues)[number];
export type Correctness = (typeof correctnessValues)[number];
export type NextActivityPurpose = (typeof nextActivityPurposeValues)[number];
export type NextActivityAxis = (typeof nextActivityAxisValues)[number];

const identifierSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,80}$/u, "This identifier is malformed.");

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const learnerItemSchema = z.strictObject({
  id: identifierSchema,
  label: boundedText(300),
  role: z.enum(["source", "target", "distractor"]),
});

export type LearnerItem = z.infer<typeof learnerItemSchema>;

export const learnerSectionSchema = z.strictObject({
  id: identifierSchema,
  kind: z.enum(sectionKindValues),
  title: boundedText(200),
  body: boundedText(4000),
  itemIds: z.array(identifierSchema).max(50),
  items: z.array(learnerItemSchema).max(50).optional(),
});

export type LearnerSection = z.infer<typeof learnerSectionSchema>;

const hashSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/u);

export const learnerNextActivitySchema = z
  .strictObject({
    activityId: identifierSchema.nullable(),
    activityAxis: z.enum(nextActivityAxisValues),
    purpose: z.enum(nextActivityPurposeValues),
    reason: boundedText(2000),
    ruleVersion: boundedText(80),
    evidenceHash: hashSchema,
    derivedFromAttemptId: identifierSchema.nullable(),
  })
  .nullable();

export type LearnerNextActivity = z.infer<typeof learnerNextActivitySchema>;

export const learnerColumnsSchema = z.strictObject({
  sourceLabel: boundedText(200),
  targetLabel: boundedText(200),
});

export type LearnerColumns = z.infer<typeof learnerColumnsSchema>;

export const learnerLessonSchema = z.strictObject({
  publicationId: identifierSchema,
  lessonVersionId: identifierSchema,
  assignedVariantId: identifierSchema,
  assignedSectionId: identifierSchema,
  columns: learnerColumnsSchema.nullable(),
  sections: z.array(learnerSectionSchema).max(4),
  stage: z.enum(runStageValues),
  firstResponseStatus: z.enum(firstResponseStatusValues),
  nextActivity: learnerNextActivitySchema,
});

export type LearnerLesson = z.infer<typeof learnerLessonSchema>;

export const learnerRevealPairSchema = z.strictObject({
  sourceId: identifierSchema,
  sourceLabel: boundedText(300),
  targetId: identifierSchema,
  targetLabel: boundedText(300),
  correct: z.boolean(),
});

export const learnerRevealUnresolvedSchema = z.strictObject({
  sourceId: identifierSchema,
  sourceLabel: boundedText(300),
});

export const learnerRevealSchema = z.strictObject({
  ruleVersion: boundedText(80),
  pairs: z.array(learnerRevealPairSchema).max(50),
  unresolved: z.array(learnerRevealUnresolvedSchema).max(50),
  feedback: boundedText(4000).nullable(),
  connection: boundedText(4000).nullable(),
});

export type LearnerReveal = z.infer<typeof learnerRevealSchema>;

export const learnerAttemptEvidenceSchema = z.strictObject({
  attemptId: identifierSchema,
  itemId: identifierSchema,
  ordinal: z.number().int().min(1),
  score: z.number().int().min(0).max(100),
  correctness: z.enum(correctnessValues),
  assistanceState: z.enum(["none", "hinted"]),
  createdAt: z.string().min(1),
});

export const learnerAssistanceEventSchema = z.strictObject({
  eventId: identifierSchema,
  itemId: identifierSchema,
  kind: z.enum(["hint", "other"]),
  ordinal: z.number().int().min(1),
  recordedAt: z.string().min(1),
});

export const learnerEvidenceSchema = z.strictObject({
  runId: identifierSchema,
  attempts: z.array(learnerAttemptEvidenceSchema).max(50),
  assistanceEvents: z.array(learnerAssistanceEventSchema).max(50),
});

export type LearnerEvidence = z.infer<typeof learnerEvidenceSchema>;

export const learnerRunResponseSchema = z.strictObject({
  runId: identifierSchema,
  runRevision: z.number().int().min(0).max(1_000_000),
  lesson: learnerLessonSchema,
  evidence: learnerEvidenceSchema,
});

export type LearnerRunResponse = z.infer<typeof learnerRunResponseSchema>;

export const learnerAttemptResponseSchema = z.strictObject({
  attemptId: identifierSchema,
  gradingRuleVersion: boundedText(80),
  score: z.number().int().min(0).max(100),
  correctness: z.enum(correctnessValues),
  requiredMatches: z.number().int().min(0).max(50),
  correctMatches: z.number().int().min(0).max(50),
  incorrectMatches: z.number().int().min(0).max(50),
  missingMatches: z.number().int().min(0).max(50),
  reveal: learnerRevealSchema,
  nextActivity: learnerNextActivitySchema,
});

export type LearnerAttemptResponse = z.infer<
  typeof learnerAttemptResponseSchema
>;
