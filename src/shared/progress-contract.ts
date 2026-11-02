import { z } from "zod";

// The teacher-facing progress contract. `GET /api/teacher/progress` returns
// these shapes, and the teacher progress page parses them on arrival, so a
// renamed field fails on both sides. Storage schemas stay stricter and
// server-side; the run's stored decision is re-validated here field by field.

import {
  correctnessValues,
  nextActivityAxisValues,
  nextActivityPurposeValues,
  runStageValues,
  sectionKindValues,
} from "./learner-contract";

const identifierSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,80}$/u, "This identifier is malformed.");

const boundedText = (max: number) => z.string().trim().min(1).max(max);

const hashSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/u);

export const teacherProgressAttemptSchema = z.strictObject({
  attemptId: identifierSchema,
  itemId: identifierSchema,
  ordinal: z.number().int().min(1),
  score: z.number().int().min(0).max(100),
  correctness: z.enum(correctnessValues),
  assistanceState: z.enum(["none", "hinted"]),
  /**
  Event identifiers only. They are part of the decision evidence hash, so the stored reason can be replayed from the row alone; no event content rides along.
  */
  assistanceEventIds: z.array(identifierSchema).max(50),
  createdAt: z.string().min(1),
});

export type TeacherProgressAttempt = z.infer<
  typeof teacherProgressAttemptSchema
>;

/**
The adaptation decision stored on the run. The same seven fields the learner run persists; the teacher reads the reason, the rule that wrote it, and the evidence hash that pins it — never the answer key behind the evidence.
*/
export const teacherProgressDecisionSchema = z
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

export type TeacherProgressDecision = z.infer<
  typeof teacherProgressDecisionSchema
>;

/**
The approved screen the run is on, plus the screen sequence it belongs to.
Read-only preview material: labels and roles, no correct targets.
*/
export const teacherProgressScreenSchema = z.strictObject({
  lessonVersionId: identifierSchema,
  assignedSectionId: identifierSchema,
  title: boundedText(200),
  body: boundedText(4000),
  items: z
    .array(
      z.strictObject({
        id: identifierSchema,
        label: boundedText(300),
        role: z.enum(["source", "target", "distractor"]),
      })
    )
    .max(50),
  sequence: z
    .array(
      z.strictObject({
        id: identifierSchema,
        kind: z.enum(sectionKindValues),
        title: boundedText(200),
      })
    )
    .max(4),
});

export type TeacherProgressScreen = z.infer<typeof teacherProgressScreenSchema>;

export const teacherProgressRunSchema = z.strictObject({
  runId: identifierSchema,
  learnerId: identifierSchema,
  publicationId: identifierSchema,
  stage: z.enum(runStageValues),
  firstResponseStatus: z.enum(["pending", "submitted"]),
  revision: z.number().int().min(0).max(1_000_000),
  updatedAt: z.string().min(1),
  attempts: z.array(teacherProgressAttemptSchema).max(50),
  nextActivity: teacherProgressDecisionSchema,
  screen: teacherProgressScreenSchema.nullable(),
});

export type TeacherProgressRun = z.infer<typeof teacherProgressRunSchema>;

export const teacherProgressResponseSchema = z.strictObject({
  runs: z.array(teacherProgressRunSchema).max(50),
});

export type TeacherProgressResponse = z.infer<
  typeof teacherProgressResponseSchema
>;

/**
The private API error body. Unknown keys are stripped rather than rejected so delivery may add fields.
*/
export const teacherProgressErrorResponseSchema = z.object({
  code: z.string().optional(),
});
