import { z } from "zod";

import {
  curatedReviewedContentSchema,
  provenanceSchema,
  ruleVersionsSchema,
  sectionsSchema,
  validationResultSchema,
  variantReferencesSchema,
} from "./authoring";
import {
  assistanceStateValues,
  correctnessValues,
  recordLimits,
  revisionKindValues,
  teacherDecisionActionValues,
} from "./vocabulary";
import { hashSchema, recordIdSchema, scoreSchema } from "./envelope";
import { privateAnswerRelationshipsSchema } from "./private-answers";
import { selectedPairSchema } from "./delivery";

export const operationKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(recordLimits.shortText);

const progressRevisionSchema = z
  .number()
  .int()
  .min(0)
  .max(recordLimits.revisionMax);

export const storeGroundingInputSchema = z.strictObject({
  operationKey: operationKeySchema,
  standardId: recordIdSchema,
  referenceKey: z.string().trim().min(1).max(recordLimits.idLength),
  referenceVersion: z.string().trim().min(1).max(recordLimits.shortText),
  title: z.string().trim().min(1).max(recordLimits.titleText),
  attribution: z.string().trim().min(1).max(recordLimits.attributionText),
  sourceLocator: z.string().trim().min(1).max(recordLimits.locatorText),
  reviewedContent: curatedReviewedContentSchema,
});

export type StoreGroundingInput = z.infer<typeof storeGroundingInputSchema>;

export const appendVersionInputSchema = z.strictObject({
  operationKey: operationKeySchema,
  package: z.strictObject({
    id: recordIdSchema,
    title: z.string().trim().min(1).max(recordLimits.titleText),
    standardId: recordIdSchema,
  }),
  expectedHeadRevision: progressRevisionSchema,
  revisionKind: z.enum(revisionKindValues),
  parentVersionId: recordIdSchema.nullable(),
  predecessorVersionId: recordIdSchema.nullable(),
  curatedReferenceId: recordIdSchema,
  generationRequestId: recordIdSchema.nullable(),
  conceptIds: z.array(recordIdSchema).max(recordLimits.listMax),
  variantReferences: variantReferencesSchema,
  objectiveHash: hashSchema,
  sections: sectionsSchema,
  provenance: provenanceSchema,
  changedSectionIds: z.array(recordIdSchema).max(recordLimits.sectionCount),
  ruleVersions: ruleVersionsSchema,
  validationResult: validationResultSchema,
  privateAnswerRelationships: privateAnswerRelationshipsSchema,
});

export type AppendVersionInput = z.infer<typeof appendVersionInputSchema>;

export const publishInputSchema = z.strictObject({
  operationKey: operationKeySchema,
  versionId: recordIdSchema,
  contentHash: hashSchema,
  packageHash: hashSchema,
  privateAnswerDigest: hashSchema,
  validationResultHash: hashSchema,
  ruleVersions: ruleVersionsSchema,
});

export type PublishInput = z.infer<typeof publishInputSchema>;

export const assignInputSchema = z.strictObject({
  operationKey: operationKeySchema,
  publicationId: recordIdSchema,
  learnerId: recordIdSchema,
  classId: recordIdSchema.optional(),
});

export type AssignInput = z.infer<typeof assignInputSchema>;

export const startRunInputSchema = z.strictObject({
  operationKey: operationKeySchema,
  assignmentId: recordIdSchema,
  assignedVariantId: recordIdSchema,
});

export type StartRunInput = z.infer<typeof startRunInputSchema>;

export const recordHintInputSchema = z.strictObject({
  operationKey: operationKeySchema,
  runId: recordIdSchema,
  itemId: recordIdSchema,
  expectedRunRevision: progressRevisionSchema,
});

export type RecordHintInput = z.infer<typeof recordHintInputSchema>;

export const recordAttemptInputSchema = z.strictObject({
  operationKey: operationKeySchema,
  runId: recordIdSchema,
  itemId: recordIdSchema,
  expectedRunRevision: progressRevisionSchema,
  priorAttemptId: recordIdSchema.nullable(),
  selectedPairs: z.array(selectedPairSchema).max(recordLimits.itemMax),
  assistanceState: z.enum(assistanceStateValues),
  assistanceEventIds: z.array(recordIdSchema).max(recordLimits.listMax),
  score: scoreSchema,
  correctness: z.enum(correctnessValues),
  gradingRuleVersion: z.string().trim().min(1).max(recordLimits.idLength),
});

export type RecordAttemptInput = z.infer<typeof recordAttemptInputSchema>;

export const chooseInputSchema = z.strictObject({
  operationKey: operationKeySchema,
  runId: recordIdSchema,
  expectedRunRevision: progressRevisionSchema,
  evidenceHash: hashSchema,
  proposal: z.strictObject({
    ruleVersion: z.string().trim().min(1).max(recordLimits.idLength),
    summary: z.string().trim().min(1).max(recordLimits.summaryText),
  }),
  action: z.enum(teacherDecisionActionValues),
  approvedTargetId: recordIdSchema.nullable(),
});

export type ChooseInput = z.infer<typeof chooseInputSchema>;

export const readAuthoringInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("version"), versionId: recordIdSchema }),
  z.strictObject({ kind: z.literal("package"), packageId: recordIdSchema }),
]);

export type ReadAuthoringInput = z.infer<typeof readAuthoringInputSchema>;

export const readEvidenceInputSchema = z.strictObject({
  runId: recordIdSchema,
});

export const readLessonInputSchema = z.strictObject({
  runId: recordIdSchema,
});

export const readAttemptContextInputSchema = z.strictObject({
  runId: recordIdSchema,
  itemId: recordIdSchema,
});

export const referentTableValues = [
  "standards",
  "actors",
  "lesson_packages",
  "lesson_versions",
  "curated_references",
  "lesson_draft_requests",
  "prerequisite_nodes",
  "publications",
  "identities",
  "assignments",
  "learner_runs",
  "learner_attempts",
  "assistance_events",
  "roster-class",
  "lesson-version-content",
] as const;

export type ReferentTable = (typeof referentTableValues)[number];

export interface ReferentDescriptor {
  readonly path: string;
  readonly table: ReferentTable;
  readonly optional?: boolean;
}

const lessonVersionContent = "lesson-version-content" satisfies ReferentTable;

/**
 * Every scope-qualified reference a write input can carry. The referent sweep
 * test derives the `*Id` fields from the input schemas and fails when one is
 * missing here, so a new unchecked reference cannot ship.
 */
export const writeInputSchemas = {
  "store-grounding": storeGroundingInputSchema,
  "append-version": appendVersionInputSchema,
  publish: publishInputSchema,
  assign: assignInputSchema,
  "start-run": startRunInputSchema,
  "record-hint": recordHintInputSchema,
  "record-attempt": recordAttemptInputSchema,
  choose: chooseInputSchema,
} as const;

export type WriteAction = keyof typeof writeInputSchemas;

/**
 * Every scope-qualified reference a write input can carry. The referent sweep
 * test derives the `*Id` fields from the input schemas and fails when one is
 * missing here, so a new unchecked reference cannot ship.
 */
export const writeInputReferents: Record<
  WriteAction,
  readonly ReferentDescriptor[]
> = {
  "store-grounding": [{ path: "standardId", table: "standards" }],
  "append-version": [
    { path: "package.id", table: "lesson_packages", optional: true },
    { path: "package.standardId", table: "standards" },
    { path: "parentVersionId", table: "lesson_versions", optional: true },
    { path: "predecessorVersionId", table: "lesson_versions", optional: true },
    { path: "curatedReferenceId", table: "curated_references" },
    {
      path: "generationRequestId",
      table: "lesson_draft_requests",
      optional: true,
    },
    { path: "conceptIds", table: "prerequisite_nodes" },
    { path: "variantReferences.variantId", table: lessonVersionContent },
    { path: "sections.itemIds", table: lessonVersionContent },
    { path: "changedSectionIds", table: lessonVersionContent },
    {
      path: "provenance.authoredEdits.sectionId",
      table: lessonVersionContent,
    },
    { path: "provenance.authoredEdits.actorId", table: "actors" },
    {
      path: "privateAnswerRelationships.itemId",
      table: lessonVersionContent,
    },
    {
      path: "privateAnswerRelationships.correctTargetIds",
      table: lessonVersionContent,
    },
  ],
  publish: [{ path: "versionId", table: "lesson_versions" }],
  assign: [
    { path: "publicationId", table: "publications" },
    { path: "learnerId", table: "identities" },
    { path: "classId", table: "roster-class", optional: true },
  ],
  "start-run": [
    { path: "assignmentId", table: "assignments" },
    { path: "assignedVariantId", table: lessonVersionContent },
  ],
  "record-hint": [
    { path: "runId", table: "learner_runs" },
    { path: "itemId", table: lessonVersionContent },
  ],
  "record-attempt": [
    { path: "runId", table: "learner_runs" },
    { path: "itemId", table: lessonVersionContent },
    { path: "priorAttemptId", table: "learner_attempts", optional: true },
    { path: "assistanceEventIds", table: "assistance_events" },
    { path: "selectedPairs.sourceId", table: lessonVersionContent },
    { path: "selectedPairs.targetId", table: lessonVersionContent },
  ],
  choose: [
    { path: "runId", table: "learner_runs" },
    {
      path: "approvedTargetId",
      table: lessonVersionContent,
      optional: true,
    },
  ],
};
