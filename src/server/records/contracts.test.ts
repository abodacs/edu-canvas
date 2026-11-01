import { describe, expect, it } from "vitest";

import {
  curatedReferenceSchema,
  lessonVersionSchema,
  publicationSchema,
} from "./authoring";
import { canonicalJson } from "./canonical-json";
import {
  assignmentSchema,
  assistanceEventSchema,
  learnerAttemptSchema,
  learnerRunSchema,
  teacherDecisionSchema,
} from "./delivery";
import { operationReceiptSchema } from "./evidence";
import {
  createContentHash,
  createCuratedContentHash,
  createPackageHash,
  createPrivateAnswerDigest,
  createValidationResultHash,
} from "./hashes";
import { projectStudentLesson, projectTeacherVersion } from "./projections";
import { hashVersion, recordLimits } from "./vocabulary";

const tenantId = "tenant_fixture_1";
const actorId = "actor_fixture_1";
const createdAt = "2026-10-28T00:00:00.000Z";

const reviewedContent = {
  summary: "Equivalent fractions name the same amount.",
  keyIdeas: ["Multiply numerator and denominator by the same number."],
  workedExample: "1/2 = 2/4 because both parts double.",
  commonMisconceptions: ["Adding the same number to both parts."],
};

const sections = [
  {
    id: "section_worked",
    kind: "worked-example" as const,
    title: "Worked example",
    body: "Show 1/2 and 2/4 with the same bar.",
    itemIds: ["item_1"],
  },
  {
    id: "section_guided",
    kind: "guided-practice" as const,
    title: "Guided practice",
    body: "Match each fraction to its equivalent.",
    itemIds: ["item_1", "item_2"],
  },
  {
    id: "section_independent",
    kind: "independent-check" as const,
    title: "Independent check",
    body: "Complete the matching on your own.",
    itemIds: ["item_1"],
  },
  {
    id: "section_follow_up",
    kind: "follow-up" as const,
    title: "Follow up",
    body: "Explain why the two fractions are equal.",
    itemIds: ["item_2"],
  },
];

const variantReferences = [
  { variantId: "variant_standard", kind: "standard" as const },
  { variantId: "variant_scaffold", kind: "scaffold" as const },
  { variantId: "variant_challenge", kind: "challenge" as const },
];

const validationResult = {
  ok: true,
  validatorVersion: "lesson-validator-v2",
  checkedAt: createdAt,
  findings: [],
};

const ruleVersions = {
  hashVersion,
  validatorVersion: "lesson-validator-v2",
  catalogVersion: "matching-v1",
  graphVersion: "equivalent-fractions-v1",
  projectionVersion: "lesson-package-public-v1",
};

const curatedReference = {
  id: "curated_1",
  tenantId,
  teacherActorId: actorId,
  schemaVersion: "curated-reference-v1" as const,
  kind: "curated" as const,
  standardId: "standard_1",
  referenceKey: "equivalent-fractions",
  referenceVersion: "2026-10",
  title: "Equivalent fractions",
  attribution: "Synthetic curriculum fixture",
  sourceLocator: "fixture://equivalent-fractions",
  reviewedContent,
  contentHash: createCuratedContentHash({
    standardId: "standard_1",
    referenceKey: "equivalent-fractions",
    referenceVersion: "2026-10",
    reviewedContent,
  }),
  createdAt,
};

const contentHash = createContentHash({
  conceptIds: ["concept_1"],
  sections,
  variantReferences,
});
const privateAnswerDigest = createPrivateAnswerDigest([
  { itemId: "item_1", correctTargetIds: ["target_1"] },
]);

const lessonVersion = {
  id: "version_1",
  tenantId,
  packageId: "package_1",
  revision: 1,
  schemaVersion: "lesson-package-curated-v1" as const,
  parentVersionId: null,
  predecessorVersionId: null,
  curatedReferenceId: "curated_1",
  sourceSnapshotId: null,
  generationRequestId: null,
  conceptIds: ["concept_1"],
  variantReferences,
  objectiveHash: "a".repeat(64),
  sections,
  provenance: {
    provider: null,
    modelVersion: null,
    promptVersion: null,
    authoredEdits: [],
  },
  revisionKind: "initial" as const,
  changedSectionIds: [],
  contentHash,
  packageHash: createPackageHash({ contentHash, privateAnswerDigest }),
  privateAnswerDigest,
  privateAnswerRelationships: [
    { itemId: "item_1", correctTargetIds: ["target_1"] },
  ],
  validationResult,
  validationResultHash: createValidationResultHash(validationResult),
  ruleVersions,
  createdAt,
};

describe("lesson version references", () => {
  it("accepts a version grounded in a source snapshot instead of a curation", () => {
    const parsed = lessonVersionSchema.parse({
      ...lessonVersion,
      curatedReferenceId: null,
      sourceSnapshotId: "snapshot_1",
    });

    expect(parsed.sourceSnapshotId).toBe("snapshot_1");
  });

  it("rejects a version with both references and with neither", () => {
    expect(() => {
      return lessonVersionSchema.parse({
        ...lessonVersion,
        sourceSnapshotId: "snapshot_1",
      });
    }).toThrow(/exactly one/u);

    expect(() => {
      return lessonVersionSchema.parse({
        ...lessonVersion,
        curatedReferenceId: null,
      });
    }).toThrow(/exactly one/u);
  });
});

describe("record contracts", () => {
  it("parses a curated reference and a lesson version", () => {
    expect(curatedReferenceSchema.parse(curatedReference).id).toBe("curated_1");
    expect(lessonVersionSchema.parse(lessonVersion).revision).toBe(1);
  });

  it("rejects unknown fields at the top level and inside a nested object", () => {
    expect(() =>
      curatedReferenceSchema.parse({ ...curatedReference, extra: true })
    ).toThrow(/Unrecognized key/u);
    expect(() => {
      return curatedReferenceSchema.parse({
        ...curatedReference,
        reviewedContent: { ...reviewedContent, hidden: "x" },
      });
    }).toThrow(/Unrecognized key/u);
  });

  it("rejects a lineage that contradicts the revision kind", () => {
    expect(() => {
      return lessonVersionSchema.parse({
        ...lessonVersion,
        revisionKind: "section-revision",
      });
    }).toThrow(/lineage/u);
    expect(() => {
      return lessonVersionSchema.parse({
        ...lessonVersion,
        parentVersionId: "version_0",
      });
    }).toThrow(/lineage/u);
  });

  it("rejects an unknown schema literal", () => {
    expect(() => {
      return lessonVersionSchema.parse({
        ...lessonVersion,
        schemaVersion: "lesson-package-v2",
      });
    }).toThrow(/Invalid/u);
  });

  it("parses publication, assignment, run, assistance, attempt, decision, receipt", () => {
    const publication = publicationSchema.parse({
      id: "publication_1",
      tenantId,
      schemaVersion: "publication-v1",
      lessonVersionId: "version_1",
      approvingActorId: actorId,
      contentHash: lessonVersion.contentHash,
      packageHash: lessonVersion.packageHash,
      privateAnswerDigest,
      validationResultHash: lessonVersion.validationResultHash,
      ruleVersions,
      approvedAt: createdAt,
      createdAt,
    });

    assignmentSchema.parse({
      id: "assignment_1",
      tenantId,
      schemaVersion: "assignment-v1",
      publicationId: publication.id,
      learnerId: "learner_1",
      assigningActorId: actorId,
      createdAt,
    });

    learnerRunSchema.parse({
      id: "run_1",
      tenantId,
      schemaVersion: "learner-run-v1",
      assignmentId: "assignment_1",
      learnerId: "learner_1",
      publicationId: publication.id,
      assignedVariantId: "variant_standard",
      stage: "assigned",
      firstResponseStatus: "pending",
      revision: 0,
      nextActivity: null,
      createdAt,
      updatedAt: createdAt,
    });

    assistanceEventSchema.parse({
      id: "assistance_1",
      tenantId,
      schemaVersion: "assistance-event-v1",
      runId: "run_1",
      itemId: "item_1",
      kind: "hint",
      ordinal: 1,
      recordedAt: createdAt,
    });

    learnerAttemptSchema.parse({
      id: "attempt_1",
      tenantId,
      schemaVersion: "attempt-v2",
      runId: "run_1",
      publicationId: publication.id,
      lessonVersionId: "version_1",
      itemId: "item_1",
      ordinal: 1,
      priorAttemptId: null,
      selectedPairs: [{ sourceId: "source_1", targetId: "target_1" }],
      assistanceState: "hinted",
      assistanceEventIds: ["assistance_1"],
      score: recordLimits.scoreMax,
      correctness: "correct",
      gradingRuleVersion: "matching-grader-v1",
      createdAt,
    });

    teacherDecisionSchema.parse({
      id: "decision_1",
      tenantId,
      schemaVersion: "teacher-decision-v1",
      runId: "run_1",
      teacherActorId: actorId,
      evidenceHash: "b".repeat(64),
      proposal: { ruleVersion: "decision-rule-v1", summary: "Continue." },
      action: "accept",
      approvedTargetId: "item_2",
      createdAt,
    });

    operationReceiptSchema.parse({
      id: "receipt_1",
      tenantId,
      schemaVersion: "operation-receipt-v1",
      actorId,
      membershipId: "membership_1",
      authorizationRevision: 1,
      action: "publish",
      operationKey: "operation-key-1",
      inputHash: "c".repeat(64),
      resultKind: "publication",
      resultIds: ["publication_1"],
      createdAt,
    });

    expect(publication.id).toBe("publication_1");
  });

  it("rejects a pause decision with a target and a score outside the scale", () => {
    expect(() => {
      return teacherDecisionSchema.parse({
        id: "decision_2",
        tenantId,
        schemaVersion: "teacher-decision-v1",
        runId: "run_1",
        teacherActorId: actorId,
        evidenceHash: "b".repeat(64),
        proposal: { ruleVersion: "decision-rule-v1", summary: "Pause." },
        action: "pause",
        approvedTargetId: "item_2",
        createdAt,
      });
    }).toThrow(/Pause|target/u);

    expect(() => {
      return learnerAttemptSchema.parse({
        id: "attempt_2",
        tenantId,
        schemaVersion: "attempt-v2",
        runId: "run_1",
        publicationId: "publication_1",
        lessonVersionId: "version_1",
        itemId: "item_1",
        ordinal: 1,
        priorAttemptId: null,
        selectedPairs: [],
        assistanceState: "none",
        assistanceEventIds: [],
        score: recordLimits.scoreMax + 1,
        correctness: "incorrect",
        gradingRuleVersion: "matching-grader-v1",
        createdAt,
      });
    }).toThrow(/score|Too big/u);
  });

  it("hashes deterministically and rejects undefined", () => {
    expect(canonicalJson({ b: 1, a: [2, 3] })).toBe('{"a":[2,3],"b":1}');

    expect(canonicalJson({ a: null })).toBe('{"a":null}');

    const incomplete: Record<string, unknown> = {};

    expect(() => canonicalJson({ a: incomplete.missing })).toThrow(
      /undefined/u
    );

    expect(contentHash).toBe(
      createContentHash({
        conceptIds: ["concept_1"],
        sections,
        variantReferences,
      })
    );
    expect(contentHash).toHaveLength(64);
  });

  it("teacher and student projections omit every private field", () => {
    const version = lessonVersionSchema.parse(lessonVersion);
    const run = learnerRunSchema.parse({
      id: "run_1",
      tenantId,
      schemaVersion: "learner-run-v1",
      assignmentId: "assignment_1",
      learnerId: "learner_1",
      publicationId: "publication_1",
      assignedVariantId: "variant_standard",
      stage: "assigned",
      firstResponseStatus: "pending",
      revision: 0,
      nextActivity: null,
      createdAt,
      updatedAt: createdAt,
    });

    const serialized = [
      JSON.stringify(projectTeacherVersion(version)),
      JSON.stringify(projectStudentLesson({ version, run })),
    ].join("\n");

    const leaked = [
      "privateAnswerRelationships",
      "contentHash",
      "packageHash",
      "privateAnswerDigest",
      "rawPrompt",
      "internalErrorBody",
    ].filter((hidden) => serialized.includes(hidden));

    expect(leaked).toStrictEqual([]);
  });
});
