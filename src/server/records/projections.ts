import { z } from "zod";

import { createEvidenceHash } from "./hashes";
import { isoTimestampSchema, recordIdSchema, scoreSchema } from "./envelope";
import {
  assistanceKindValues,
  assistanceStateValues,
  correctnessValues,
  firstResponseStatusValues,
  recordLimits,
  runStageValues,
  teacherDecisionActionValues,
} from "./vocabulary";
import type {
  AssistanceEvent,
  LearnerAttempt,
  LearnerRun,
  TeacherDecision,
} from "./delivery";
import type { LessonVersion } from "./authoring";

/**
 * Explicit allowlists. A projection is constructed field by field, never by
 * deleting keys from a stored record, so a new private field cannot leak by
 * default. `contentHash`, `packageHash`, `privateAnswerDigest`, and
 * `privateAnswerRelationships` are absent from every projection.
 */
export const teacherVersionProjectionSchema = z.strictObject({
  id: recordIdSchema,
  tenantId: recordIdSchema,
  packageId: recordIdSchema,
  revision: z.number().int().min(1),
  schemaVersion: z.literal("lesson-package-curated-v1"),
  parentVersionId: recordIdSchema.nullable(),
  predecessorVersionId: recordIdSchema.nullable(),
  revisionKind: z.string().min(1),
  conceptIds: z.array(recordIdSchema).max(recordLimits.listMax),
  variantReferences: z.array(z.unknown()).max(recordLimits.variantMax),
  sections: z.array(z.unknown()).length(recordLimits.sectionCount),
  provenance: z.unknown(),
  validationResult: z.unknown(),
  ruleVersions: z.unknown(),
  createdAt: isoTimestampSchema,
});

export type TeacherVersionProjection = z.infer<
  typeof teacherVersionProjectionSchema
>;

export const projectTeacherVersion = (
  version: LessonVersion
): TeacherVersionProjection => {
  return teacherVersionProjectionSchema.parse({
    id: version.id,
    tenantId: version.tenantId,
    packageId: version.packageId,
    revision: version.revision,
    schemaVersion: version.schemaVersion,
    parentVersionId: version.parentVersionId,
    predecessorVersionId: version.predecessorVersionId,
    revisionKind: version.revisionKind,
    conceptIds: version.conceptIds,
    variantReferences: version.variantReferences,
    sections: version.sections,
    provenance: version.provenance,
    validationResult: version.validationResult,
    ruleVersions: version.ruleVersions,
    createdAt: version.createdAt,
  });
};

export const studentLessonProjectionSchema = z.strictObject({
  publicationId: recordIdSchema,
  lessonVersionId: recordIdSchema,
  assignedVariantId: recordIdSchema,
  sections: z.array(z.unknown()).length(recordLimits.sectionCount),
  stage: z.enum(runStageValues),
  firstResponseStatus: z.enum(firstResponseStatusValues),
  nextActivity: z.unknown(),
});

export type StudentLessonProjection = z.infer<
  typeof studentLessonProjectionSchema
>;

export const projectStudentLesson = (input: {
  readonly version: LessonVersion;
  readonly run: LearnerRun;
}): StudentLessonProjection => {
  return studentLessonProjectionSchema.parse({
    publicationId: input.run.publicationId,
    lessonVersionId: input.version.id,
    assignedVariantId: input.run.assignedVariantId,
    sections: input.version.sections,
    stage: input.run.stage,
    firstResponseStatus: input.run.firstResponseStatus,
    nextActivity: input.run.nextActivity,
  });
};

export const attemptProjectionSchema = z.strictObject({
  attemptId: recordIdSchema,
  itemId: recordIdSchema,
  ordinal: z.number().int().min(1),
  score: scoreSchema,
  correctness: z.enum(correctnessValues),
  assistanceState: z.enum(assistanceStateValues),
  createdAt: isoTimestampSchema,
});

export const assistanceProjectionSchema = z.strictObject({
  eventId: recordIdSchema,
  itemId: recordIdSchema,
  kind: z.enum(assistanceKindValues),
  ordinal: z.number().int().min(1),
  recordedAt: isoTimestampSchema,
});

export const decisionProjectionSchema = z.strictObject({
  decisionId: recordIdSchema,
  action: z.enum(teacherDecisionActionValues),
  approvedTargetId: recordIdSchema.nullable(),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  createdAt: isoTimestampSchema,
});

const projectAttempt = (attempt: LearnerAttempt) => {
  return {
    attemptId: attempt.id,
    itemId: attempt.itemId,
    ordinal: attempt.ordinal,
    score: attempt.score,
    correctness: attempt.correctness,
    assistanceState: attempt.assistanceState,
    createdAt: attempt.createdAt,
  };
};

const projectAssistance = (event: AssistanceEvent) => {
  return {
    eventId: event.id,
    itemId: event.itemId,
    kind: event.kind,
    ordinal: event.ordinal,
    recordedAt: event.recordedAt,
  };
};

const projectDecision = (decision: TeacherDecision) => {
  return {
    decisionId: decision.id,
    action: decision.action,
    approvedTargetId: decision.approvedTargetId,
    evidenceHash: decision.evidenceHash,
    createdAt: decision.createdAt,
  };
};

/**
 * Evidence identity excludes storage timestamps: their precision differs between drivers and they are not part of what the teacher decides on.
 */
export const evidenceAttempts = (
  attempts: readonly LearnerAttempt[]
): readonly Record<string, unknown>[] => {
  return attempts.map((attempt) => {
    return {
      id: attempt.id,
      itemId: attempt.itemId,
      ordinal: attempt.ordinal,
      selectedPairs: attempt.selectedPairs,
      assistanceState: attempt.assistanceState,
      assistanceEventIds: attempt.assistanceEventIds,
      score: attempt.score,
      correctness: attempt.correctness,
      gradingRuleVersion: attempt.gradingRuleVersion,
    };
  });
};

export const evidenceAssistanceEvents = (
  events: readonly AssistanceEvent[]
): readonly Record<string, unknown>[] => {
  return events.map((event) => {
    return {
      id: event.id,
      itemId: event.itemId,
      kind: event.kind,
      ordinal: event.ordinal,
    };
  });
};

export const studentEvidenceProjectionSchema = z.strictObject({
  runId: recordIdSchema,
  attempts: z.array(attemptProjectionSchema).max(recordLimits.listMax),
  assistanceEvents: z
    .array(assistanceProjectionSchema)
    .max(recordLimits.listMax),
});

export type StudentEvidenceProjection = z.infer<
  typeof studentEvidenceProjectionSchema
>;

export const projectStudentEvidence = (input: {
  readonly run: LearnerRun;
  readonly attempts: readonly LearnerAttempt[];
  readonly assistanceEvents: readonly AssistanceEvent[];
}): StudentEvidenceProjection => {
  return studentEvidenceProjectionSchema.parse({
    runId: input.run.id,
    attempts: input.attempts.map((attempt) => projectAttempt(attempt)),
    assistanceEvents: input.assistanceEvents.map((event) =>
      projectAssistance(event)
    ),
  });
};

export const teacherEvidenceProjectionSchema = z.strictObject({
  runId: recordIdSchema,
  learnerId: recordIdSchema,
  publicationId: recordIdSchema,
  stage: z.enum(runStageValues),
  firstResponseStatus: z.enum(firstResponseStatusValues),
  revision: z.number().int().min(0),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  attempts: z.array(attemptProjectionSchema).max(recordLimits.listMax),
  assistanceEvents: z
    .array(assistanceProjectionSchema)
    .max(recordLimits.listMax),
  decisions: z.array(decisionProjectionSchema).max(recordLimits.listMax),
});

export type TeacherEvidenceProjection = z.infer<
  typeof teacherEvidenceProjectionSchema
>;

export const projectTeacherEvidence = (input: {
  readonly run: LearnerRun;
  readonly attempts: readonly LearnerAttempt[];
  readonly assistanceEvents: readonly AssistanceEvent[];
  readonly decisions: readonly TeacherDecision[];
}): TeacherEvidenceProjection => {
  return teacherEvidenceProjectionSchema.parse({
    runId: input.run.id,
    learnerId: input.run.learnerId,
    publicationId: input.run.publicationId,
    stage: input.run.stage,
    firstResponseStatus: input.run.firstResponseStatus,
    revision: input.run.revision,
    evidenceHash: createEvidenceHash({
      runId: input.run.id,
      publicationId: input.run.publicationId,
      learnerId: input.run.learnerId,
      attempts: evidenceAttempts(input.attempts),
      assistanceEvents: evidenceAssistanceEvents(input.assistanceEvents),
    }),
    attempts: input.attempts.map((attempt) => projectAttempt(attempt)),
    assistanceEvents: input.assistanceEvents.map((event) =>
      projectAssistance(event)
    ),
    decisions: input.decisions.map((decision) => projectDecision(decision)),
  });
};
