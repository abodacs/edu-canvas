import { z } from "zod";

import {
  boundedTextSchema,
  hashSchema,
  isoTimestampSchema,
  recordIdSchema,
  revisionSchema,
} from "./envelope";
import { privateAnswerRelationshipsSchema } from "./private-answers";
import {
  hashVersion,
  recordLimits,
  revisionKindValues,
  sectionKindValues,
  variantKindValues,
  validationSeverityValues,
} from "./vocabulary";

const initialRevision = 1;

export const curatedReviewedContentSchema = z.strictObject({
  summary: boundedTextSchema(recordLimits.summaryText),
  keyIdeas: z
    .array(boundedTextSchema(recordLimits.attributionText))
    .min(1)
    .max(recordLimits.listMax),
  workedExample: boundedTextSchema(recordLimits.summaryText),
  commonMisconceptions: z
    .array(boundedTextSchema(recordLimits.attributionText))
    .max(recordLimits.listMax),
});

export type CuratedReviewedContent = z.infer<
  typeof curatedReviewedContentSchema
>;

export const curatedReferenceSchema = z.strictObject({
  id: recordIdSchema,
  tenantId: recordIdSchema,
  teacherActorId: recordIdSchema,
  schemaVersion: z.literal("curated-reference-v1"),
  kind: z.literal("curated"),
  standardId: recordIdSchema,
  referenceKey: boundedTextSchema(recordLimits.idLength),
  referenceVersion: boundedTextSchema(recordLimits.shortText),
  title: boundedTextSchema(recordLimits.titleText),
  attribution: boundedTextSchema(recordLimits.attributionText),
  sourceLocator: boundedTextSchema(recordLimits.locatorText),
  reviewedContent: curatedReviewedContentSchema,
  contentHash: hashSchema,
  createdAt: isoTimestampSchema,
});

export type CuratedReference = z.infer<typeof curatedReferenceSchema>;

export const sectionSchema = z.strictObject({
  id: recordIdSchema,
  kind: z.enum(sectionKindValues),
  title: boundedTextSchema(recordLimits.titleText),
  body: boundedTextSchema(recordLimits.bodyText),
  itemIds: z.array(recordIdSchema).max(recordLimits.itemMax),
});

export type LessonSection = z.infer<typeof sectionSchema>;

const areSectionsInOrder = (sections: readonly LessonSection[]): boolean =>
  sections.every((section, index) => section.kind === sectionKindValues[index]);

const hasUniqueSectionIds = (sections: readonly LessonSection[]): boolean => {
  const ids = new Set(sections.map((section) => section.id));
  return ids.size === sections.length;
};

export const sectionsSchema = z
  .array(sectionSchema)
  .length(recordLimits.sectionCount)
  .refine(areSectionsInOrder, {
    message:
      "Sections must be ordered worked-example, guided-practice, independent-check, follow-up.",
  })
  .refine(hasUniqueSectionIds, {
    message: "Section identifiers must be unique.",
  });

export const variantReferenceSchema = z.strictObject({
  variantId: recordIdSchema,
  kind: z.enum(variantKindValues),
});

export const variantReferencesSchema = z
  .array(variantReferenceSchema)
  .min(1)
  .max(recordLimits.variantMax);

export const authoredEditSchema = z.strictObject({
  sectionId: recordIdSchema,
  actorId: recordIdSchema,
  editedAt: isoTimestampSchema,
});

export const provenanceSchema = z.strictObject({
  provider: z.string().trim().min(1).max(recordLimits.idLength).nullable(),
  modelVersion: z.string().trim().min(1).max(recordLimits.shortText).nullable(),
  promptVersion: z
    .string()
    .trim()
    .min(1)
    .max(recordLimits.shortText)
    .nullable(),
  authoredEdits: z.array(authoredEditSchema).max(recordLimits.editMax),
});

export type RecordProvenance = z.infer<typeof provenanceSchema>;

export const validationFindingSchema = z.strictObject({
  code: boundedTextSchema(recordLimits.idLength),
  severity: z.enum(validationSeverityValues),
  field: z.string().trim().min(1).max(recordLimits.idLength).optional(),
});

export const validationResultSchema = z.strictObject({
  ok: z.boolean(),
  validatorVersion: boundedTextSchema(recordLimits.idLength),
  checkedAt: isoTimestampSchema,
  findings: z.array(validationFindingSchema).max(recordLimits.findingMax),
});

export type ValidationResult = z.infer<typeof validationResultSchema>;

export const ruleVersionsSchema = z.strictObject({
  hashVersion: z.literal(hashVersion),
  validatorVersion: boundedTextSchema(recordLimits.idLength),
  catalogVersion: boundedTextSchema(recordLimits.idLength),
  graphVersion: boundedTextSchema(recordLimits.idLength),
  projectionVersion: boundedTextSchema(recordLimits.idLength),
});

export type RuleVersions = z.infer<typeof ruleVersionsSchema>;

const isLineageValid = (version: {
  revision: number;
  revisionKind: (typeof revisionKindValues)[number];
  parentVersionId: string | null;
  predecessorVersionId: string | null;
}): boolean => {
  switch (version.revisionKind) {
    case "initial": {
      return (
        version.revision === initialRevision &&
        version.parentVersionId === null &&
        version.predecessorVersionId === null
      );
    }
    case "section-revision":
    case "reframe": {
      return (
        version.revision > initialRevision &&
        version.parentVersionId !== null &&
        version.predecessorVersionId === null
      );
    }
    case "fresh-draft": {
      return (
        version.revision === initialRevision && version.parentVersionId === null
      );
    }
    default: {
      return false;
    }
  }
};

/**
 * A version is grounded in exactly one reviewed source: a curated reference for the authoring lane, or a source snapshot for the generated-pack lane. Both are nullable so either lane can write the same row shape.
 */
export const hasExactlyOneReference = (version: {
  readonly curatedReferenceId: string | null;
  readonly sourceSnapshotId?: string | null;
}): boolean => {
  const hasCurated = version.curatedReferenceId !== null;
  const hasSnapshot =
    version.sourceSnapshotId !== null && version.sourceSnapshotId !== undefined;
  return hasCurated !== hasSnapshot;
};

export const lessonVersionSchema = z
  .strictObject({
    id: recordIdSchema,
    tenantId: recordIdSchema,
    packageId: recordIdSchema,
    revision: revisionSchema,
    schemaVersion: z.literal("lesson-package-curated-v1"),
    parentVersionId: recordIdSchema.nullable(),
    predecessorVersionId: recordIdSchema.nullable(),
    curatedReferenceId: recordIdSchema.nullable(),
    sourceSnapshotId: recordIdSchema.nullable(),
    generationRequestId: recordIdSchema.nullable(),
    conceptIds: z.array(recordIdSchema).max(recordLimits.listMax),
    variantReferences: variantReferencesSchema,
    objectiveHash: hashSchema,
    sections: sectionsSchema,
    provenance: provenanceSchema,
    revisionKind: z.enum(revisionKindValues),
    changedSectionIds: z.array(recordIdSchema).max(recordLimits.sectionCount),
    contentHash: hashSchema,
    packageHash: hashSchema,
    privateAnswerDigest: hashSchema,
    privateAnswerRelationships: privateAnswerRelationshipsSchema,
    validationResult: validationResultSchema,
    validationResultHash: hashSchema,
    ruleVersions: ruleVersionsSchema,
    createdAt: isoTimestampSchema,
  })
  .refine(isLineageValid, {
    message: "Revision lineage does not match the revision kind.",
    path: ["revisionKind"],
  })
  .refine(hasExactlyOneReference, {
    message:
      "A version needs exactly one of a curated reference or a snapshot.",
    path: ["curatedReferenceId"],
  });

export type LessonVersion = z.infer<typeof lessonVersionSchema>;

export const publicationSchema = z.strictObject({
  id: recordIdSchema,
  tenantId: recordIdSchema,
  schemaVersion: z.literal("publication-v1"),
  lessonVersionId: recordIdSchema,
  approvingActorId: recordIdSchema,
  contentHash: hashSchema,
  packageHash: hashSchema,
  privateAnswerDigest: hashSchema,
  validationResultHash: hashSchema,
  ruleVersions: ruleVersionsSchema,
  approvedAt: isoTimestampSchema,
  createdAt: isoTimestampSchema,
});

export type Publication = z.infer<typeof publicationSchema>;
