import { z } from "zod";

import {
  learnerColumnsSchema,
  learnerNextActivitySchema,
  learnerSectionSchema,
} from "@/shared/learner-contract";
import {
  teacherProgressResponseSchema,
  teacherProgressRunSchema,
} from "@/shared/progress-contract";

import { createEvidenceHash } from "./hashes";
import { isoTimestampSchema, recordIdSchema, scoreSchema } from "./envelope";
import { recordError } from "./errors";
import {
  approvedCopySchema,
  provenanceSchema,
  ruleVersionsSchema,
  sectionSchema,
  validationResultSchema,
  variantReferenceSchema,
} from "./authoring";
import {
  assistanceKindValues,
  assistanceStateValues,
  correctnessValues,
  firstResponseStatusValues,
  recordLimits,
  runStageValues,
  teacherDecisionActionValues,
} from "./vocabulary";
import type { TeacherProgressResponse } from "@/shared/progress-contract";
import type {
  AssistanceEvent,
  LearnerAttempt,
  LearnerRun,
  TeacherDecision,
} from "./delivery";
import type { LessonSection, LessonVersion } from "./authoring";

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
  variantReferences: z
    .array(variantReferenceSchema)
    .max(recordLimits.variantMax),
  sections: z.array(sectionSchema).length(recordLimits.sectionCount),
  approvedCopy: approvedCopySchema.nullable(),
  provenance: provenanceSchema,
  validationResult: validationResultSchema,
  ruleVersions: ruleVersionsSchema,
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
    approvedCopy: version.approvedCopy,
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
  assignedSectionId: recordIdSchema,
  columns: learnerColumnsSchema.nullable(),
  sections: z.array(learnerSectionSchema).length(recordLimits.sectionCount),
  stage: z.enum(runStageValues),
  firstResponseStatus: z.enum(firstResponseStatusValues),
  nextActivity: learnerNextActivitySchema,
});

export type StudentLessonProjection = z.infer<
  typeof studentLessonProjectionSchema
>;

/**
The learner section is constructed field by field. `variantId` stays on the
record and never crosses this seam, so a new authoring field cannot leak by
default.
*/
const projectLearnerSection = (section: {
  readonly id: string;
  readonly kind: LessonSection["kind"];
  readonly title: string;
  readonly body: string;
  readonly itemIds: readonly string[];
  readonly items?: LessonSection["items"];
}) => {
  return learnerSectionSchema.parse({
    id: section.id,
    kind: section.kind,
    title: section.title,
    body: section.body,
    itemIds: [...section.itemIds],
    ...(section.items !== undefined && {
      items: section.items.map((item) => {
        return {
          id: item.id,
          label: item.label,
          role: item.role,
        };
      }),
    }),
  });
};

/**
The one variant→section rule for the whole record layer. A version that links variants must resolve the assigned variant exactly; a v1 row without links falls back to the first section. The learner submit path reuses this instead of re-implementing it, so the read and write paths cannot disagree.
*/
export const assignedSection = (
  version: LessonVersion,
  assignedVariantId: string
): LessonVersion["sections"][number] => {
  const [first] = version.sections;
  if (!first) {
    throw recordError("INVALID_INPUT", {
      cause: new Error("A lesson version has no sections."),
    });
  }
  const match = version.sections.find(
    (section) => section.variantId === assignedVariantId
  );
  if (match) {
    return match;
  }
  // A v1 row has no variant links at all, so the first section is the only
  // answer it can give. A row that does link variants must resolve exactly.
  if (version.sections.some((section) => section.variantId !== undefined)) {
    throw recordError("INVALID_INPUT", {
      cause: new Error("The assigned variant has no section."),
    });
  }
  return first;
};

const assignedColumns = (
  version: LessonVersion,
  assignedVariantId: string
): { readonly sourceLabel: string; readonly targetLabel: string } | null => {
  const variant = version.approvedCopy?.variants.find(
    (copy) => copy.variantId === assignedVariantId
  );
  return variant?.columns ?? null;
};

export const projectStudentLesson = (input: {
  readonly version: LessonVersion;
  readonly run: LearnerRun;
}): StudentLessonProjection => {
  const section = assignedSection(input.version, input.run.assignedVariantId);
  return studentLessonProjectionSchema.parse({
    publicationId: input.run.publicationId,
    lessonVersionId: input.version.id,
    assignedVariantId: input.run.assignedVariantId,
    assignedSectionId: section.id,
    columns: assignedColumns(input.version, input.run.assignedVariantId),
    sections: input.version.sections.map(projectLearnerSection),
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

/**
 * #8: the teacher progress row. It composes stored facts — the run, its
 * attempts, and the stored next-activity decision — into the teacher surface.
 * Nothing is re-decided here: the reason shown is the reason the rule wrote, and the keystone replay test proves the rule still agrees with the row.
 *
 * The screen material is the approved section the run sits on: labels and roles only. Private answer relationships never enter this projection.
 */
export const projectTeacherProgressRun = (input: {
  readonly run: LearnerRun;
  readonly attempts: readonly LearnerAttempt[];
  /**
  Null when the publication or the approved version behind the run is gone.
  The row still lists, so the teacher sees a designed "content missing" state instead of the run silently disappearing.
  */
  readonly version: LessonVersion | null;
}): TeacherProgressResponse["runs"][number] => {
  const section = input.version
    ? assignedSection(input.version, input.run.assignedVariantId)
    : null;
  return teacherProgressRunSchema.parse({
    runId: input.run.id,
    learnerId: input.run.learnerId,
    publicationId: input.run.publicationId,
    stage: input.run.stage,
    firstResponseStatus: input.run.firstResponseStatus,
    revision: input.run.revision,
    updatedAt: input.run.updatedAt,
    // The progress attempt carries the assistance event ids so the stored
    // decision can be replayed from the row alone; the shared learner
    // evidence projection stays narrower.
    attempts: input.attempts.map((attempt) => {
      return {
        attemptId: attempt.id,
        itemId: attempt.itemId,
        ordinal: attempt.ordinal,
        score: attempt.score,
        correctness: attempt.correctness,
        assistanceState: attempt.assistanceState,
        assistanceEventIds: [...attempt.assistanceEventIds],
        createdAt: attempt.createdAt,
      };
    }),
    nextActivity: input.run.nextActivity,
    screen:
      section && input.version
        ? {
            lessonVersionId: input.version.id,
            assignedSectionId: section.id,
            title: section.title,
            body: section.body,
            items:
              section.items?.map((item) => {
                return {
                  id: item.id,
                  label: item.label,
                  role: item.role,
                };
              }) ?? [],
            sequence: input.version.sections.map((entry) => {
              return {
                id: entry.id,
                kind: entry.kind,
                title: entry.title,
              };
            }),
          }
        : null,
  });
};

export const projectTeacherProgress = (input: {
  readonly runs: readonly {
    readonly run: LearnerRun;
    readonly attempts: readonly LearnerAttempt[];
    readonly version: LessonVersion | null;
  }[];
}): TeacherProgressResponse => {
  return teacherProgressResponseSchema.parse({
    runs: input.runs.map((entry) => {
      return projectTeacherProgressRun({
        run: entry.run,
        attempts: entry.attempts,
        version: entry.version,
      });
    }),
  });
};
