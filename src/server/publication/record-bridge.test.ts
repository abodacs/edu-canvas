import { describe, expect, it } from "vitest";

import { createLearnerService } from "@/server/learner/service";
import {
  createRecordFixture,
  fixtureConceptId,
  fixtureRequestId,
  fixtureSnapshotId,
  fixtureStandardId,
} from "@/server/persistence/records-fixtures";
import { bridgePublishedPack } from "./record-bridge";
import type { PackBridgeSource } from "./record-bridge";

const makeVariant = (
  id: string,
  kind: "standard" | "scaffold" | "challenge"
) => {
  return {
    id,
    kind,
    title: `Variant ${id}`,
    instructions: "Match each fraction to its equivalent.",
    sourceItems: [{ id: `${id}-source-1`, label: "1/2" }],
    targetItems: [{ id: `${id}-target-1`, label: "2/4" }],
    distractorItems: [],
    hints: [],
    feedback: { correct: "Yes.", incorrect: "Try again." },
    languageMetadata: {
      language: "en" as const,
      direction: "ltr" as const,
      locale: "en",
    },
    accessibilityMetadata: {
      instructions: "Match each fraction.",
      sourceGroupLabel: "Fractions",
      targetGroupLabel: "Equivalents",
    },
  };
};

const variants = [
  makeVariant("variant-a", "standard"),
  makeVariant("variant-b", "scaffold"),
  makeVariant("variant-c", "challenge"),
  makeVariant("variant-d", "standard"),
];

const source: PackBridgeSource = {
  packVersionId: "packversion01",
  requestId: fixtureRequestId,
  artifactHash: "a".repeat(64),
  approvedAt: "2026-11-01T00:00:00.000Z",
  sourceSnapshotId: fixtureSnapshotId,
  learnerId: "learner_policy",
  publicContent: {
    input: {
      prompt: "Equivalent fractions",
      grade: 4,
      standardId: fixtureStandardId,
      language: "en",
      difficulty: "on-level",
    },
    variants,
    learningPath: {
      direction: "forward",
      steps: [
        {
          nodeId: fixtureConceptId,
          label: "Equivalent fractions",
          role: "target",
          screenPurposeId: "screen-1",
          screenPurpose: "Recognise equivalent fractions.",
        },
      ],
      rationale: "Prerequisite first.",
      nextScreenRationale: "Then the target.",
      versionPins: {
        draftId: "draft-1",
        graphVersion: "equivalent-fractions-v1",
        catalogVersion: "matching-v1",
        modelVersion: "test-model",
        validatorVersion: "lesson-validator-v2",
      },
    },
  },
  privateAnswers: {
    variants: variants.map((variant) => {
      return {
        variantId: variant.id,
        relationships: [
          {
            id: `${variant.id}-relationship-1`,
            sourceId: `${variant.id}-source-1`,
            targetId: `${variant.id}-target-1`,
          },
        ],
      };
    }),
  },
  validationResult: {
    validatorVersion: "lesson-validator-v2",
    findings: [],
    diagnostics: [],
  },
  ruleVersions: {
    validatorVersion: "lesson-validator-v2",
    catalogVersion: "matching-v1",
    graphVersion: "equivalent-fractions-v1",
    artifactGatePolicyVersion: "artifact-gate-v1",
    a2uiCompileGuardVersion: "a2ui-compile-guard-v1",
  },
  provenance: {
    provider: "openai",
    model: "test-model",
    promptTemplateVersion: "prompt-v1",
    validatorVersion: "lesson-validator-v2",
    catalogVersion: "matching-v1",
    sourceSnapshotId: fixtureSnapshotId,
    editedAt: null,
    authoredEdits: [],
  },
};

describe(bridgePublishedPack, () => {
  it("writes a version, publication, and assignment the learner can use", async () => {
    const fixture = createRecordFixture();
    const bridged = await bridgePublishedPack(
      fixture.records,
      fixture.teacher,
      source
    );

    expect(bridged.versionId.length).toBeGreaterThan(0);
    expect(bridged.publicationId.length).toBeGreaterThan(0);
    expect(bridged.assignmentId.length).toBeGreaterThan(0);
  });

  it("returns the same records when the publish is retried", async () => {
    const fixture = createRecordFixture();
    const first = await bridgePublishedPack(
      fixture.records,
      fixture.teacher,
      source
    );
    const replay = await bridgePublishedPack(
      fixture.records,
      fixture.teacher,
      source
    );

    expect(replay).toStrictEqual(first);
  });

  it("appends a revised pack to the same lesson chain", async () => {
    const fixture = createRecordFixture();
    const first = await bridgePublishedPack(
      fixture.records,
      fixture.teacher,
      source
    );
    const revised = await bridgePublishedPack(
      fixture.records,
      fixture.teacher,
      { ...source, packVersionId: "packversion02" }
    );

    const authoring = await fixture.records.readAuthoring(fixture.teacher, {
      kind: "package",
      packageId: `pkg-${fixtureRequestId}`,
    });
    const [head, initial] = authoring.versions;

    expect({
      onePackage: authoring.versions.length,
      headRevision: head?.revision,
      headKind: head?.revisionKind,
      headParent: head?.parentVersionId === first.versionId,
      initialRevision: initial?.revision,
    }).toStrictEqual({
      onePackage: 2,
      headRevision: 2,
      headKind: "section-revision",
      headParent: true,
      initialRevision: 1,
    });
    expect(revised.versionId).not.toBe(first.versionId);
  });

  it("lets a student score an attempt on the bridged publication", async () => {
    const fixture = createRecordFixture();
    const bridged = await bridgePublishedPack(
      fixture.records,
      fixture.teacher,
      source
    );
    const run = await fixture.records.startRun(fixture.student, {
      operationKey: "start-run-bridge-1",
      assignmentId: bridged.assignmentId,
      assignedVariantId: "variant-a",
    });
    const service = createLearnerService(fixture.records);
    const attempt = await service.submitAttempt(fixture.student, {
      operationKey: "submit-attempt-bridge-1",
      runId: run.id,
      itemId: "variant-a-source-1",
      expectedRunRevision: 0,
      priorAttemptId: null,
      pairs: [
        { sourceId: "variant-a-source-1", targetId: "variant-a-target-1" },
      ],
      assistanceState: "none",
      assistanceEventIds: [],
    });

    expect(attempt).toMatchObject({
      score: 100,
      correctness: "correct",
      requiredMatches: 1,
      gradingRuleVersion: "matching-grader-v1",
    });

    const lesson = await fixture.records.readLesson(fixture.student, {
      runId: run.id,
    });
    const rendered = JSON.stringify(lesson.lesson.sections);

    expect(rendered).toContain('"role":"source"');
    expect(rendered).toContain('"role":"target"');
    expect(rendered).toContain("2/4");
  });
});
