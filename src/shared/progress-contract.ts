import { z } from "zod";

import {
  correctnessValues,
  firstResponseStatusValues,
  learnerColumnsSchema,
  learnerNextActivitySchema,
  learnerSectionSchema,
  runStageValues,
} from "./learner-contract";

// The teacher progress contract (#8). `GET /api/teacher/progress` returns this
// shape and the `/dashboard` page parses it again on arrival, so a renamed
// field fails on both sides. The view is observational: it carries the stored
// decision and attempt evidence only, never an answer key or a private field,
// and every consumer labels it provisional.

const identifierSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,80}$/u, "This identifier is malformed.");

/**
One stored attempt as the teacher sees it. The pairs the learner chose and every answer relationship stay on the server; the ids of recorded assistance events are evidence, not content.
*/
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

/**
The approved screen the run's assigned variant shows, read-only. The section is the learner-facing projection of the published lesson version, so the preview renders exactly what the learner was assigned.
*/
export const progressPreviewSchema = z.strictObject({
  lessonVersionId: identifierSchema,
  variantId: identifierSchema,
  section: learnerSectionSchema,
  columns: learnerColumnsSchema.nullable(),
});

export type ProgressPreview = z.infer<typeof progressPreviewSchema>;

/**
One run's results row: the stored decision verbatim, every attempt in order,
and the approved-screen preview. The decision is the server's stored
`next_activity`; the view never recomputes or rewrites it.
*/
export const progressRunSchema = z.strictObject({
  runId: identifierSchema,
  assignmentId: identifierSchema,
  learnerId: identifierSchema,
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
