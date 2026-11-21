import { z } from "zod";

import {
  correctnessValues,
  firstResponseStatusValues,
  learnerColumnsSchema,
  learnerNextActivitySchema,
  learnerSectionSchema,
  runStageValues,
} from "./learner-contract";

const identifierSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,80}$/u, "This identifier is malformed.");

export const progressAttemptSchema = z.strictObject({
  attemptId: identifierSchema,
  itemId: identifierSchema,
  ordinal: z.number().int().min(1),
  priorAttemptId: identifierSchema.nullable(),
  score: z.number().int().min(0).max(100),
  correctness: z.enum(correctnessValues),
  assistanceState: z.enum(["none", "hinted"]),
  assistanceEventIds: z.array(identifierSchema).max(50),
  createdAt: z.string().min(1),
});

export type ProgressAttempt = z.infer<typeof progressAttemptSchema>;

export const progressPreviewSchema = z.strictObject({
  lessonVersionId: identifierSchema,
  variantId: identifierSchema,
  section: learnerSectionSchema,
  columns: learnerColumnsSchema.nullable(),
});

export type ProgressPreview = z.infer<typeof progressPreviewSchema>;

export const progressRunSchema = z.strictObject({
  runId: identifierSchema,
  assignmentId: identifierSchema,
  learnerId: identifierSchema,
  learnerDisplayName: z.string().trim().min(1).max(80),
  publicationId: identifierSchema,
  assignedVariantId: identifierSchema,
  stage: z.enum(runStageValues),
  firstResponseStatus: z.enum(firstResponseStatusValues),
  revision: z.number().int().min(0).max(1_000_000),
  updatedAt: z.string().min(1),
  attempts: z.array(progressAttemptSchema).max(50),
  decision: learnerNextActivitySchema,
  preview: progressPreviewSchema.nullable(),
});

export type ProgressRun = z.infer<typeof progressRunSchema>;

export const teacherProgressResponseSchema = z.strictObject({
  fetchedAt: z.string().min(1),
  runs: z.array(progressRunSchema).max(200),
});

export type TeacherProgressResponse = z.infer<
  typeof teacherProgressResponseSchema
>;
