import { describe, expect, it } from "vitest";

import {
  parseActorId,
  parseClassId,
  parseLearnerId,
  parseMembershipId,
  parseTenantId,
} from "../identity/identifiers";
import type { Actor } from "../identity/types";
import {
  createContentHash,
  createPackageHash,
  createPrivateAnswerDigest,
  createValidationResultHash,
} from "../records/hashes";
import { hashVersion } from "../records/vocabulary";
import { createSeededRecordBackend } from "./records-seeded";
import { createRecordCommands } from "./records-commands";

const tenantId = parseTenantId("tenant_records_test");
const otherTenantId = parseTenantId("tenant_records_other");
const teacherActorId = parseActorId("actor_teacher_test");
const studentActorId = parseActorId("actor_student_test");
const teacherMembershipId = parseMembershipId("membership_teacher_test");
const studentMembershipId = parseMembershipId("membership_student_test");
const learnerId = parseLearnerId("learner_test");
const classId = parseClassId("class_test");
const standardId = "standard_test";
const conceptId = "concept_test";
const createdAt = "2026-10-28T00:00:00.000Z";
const expiresAt = "2099-01-01T00:00:00.000Z";

const buildActor = (role: "teacher" | "student", sessionId: string): Actor =>
  role === "teacher"
    ? {
        actorId: teacherActorId,
        displayName: "Teacher",
        tenantId,
        tenantName: "Test school",
        membershipId: teacherMembershipId,
        sessionId,
        sessionGeneration: "generation-1",
        authorizationRevision: 1,
        role: "teacher",
        rosterClassIds: [classId],
      }
    : {
        actorId: studentActorId,
        displayName: "Student",
        tenantId,
        tenantName: "Test school",
        membershipId: studentMembershipId,
        sessionId,
        sessionGeneration: "generation-1",
        authorizationRevision: 1,
        role: "student",
        learnerId,
      };

const teacher = buildActor("teacher", "session_teacher");
const student = buildActor("student", "session_student");

const reviewContent = {
  summary: "Equivalent fractions name the same amount.",
  keyIdeas: ["Multiply both parts by the same number."],
  workedExample: "1/2 = 2/4.",
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
    body: "Explain why the fractions are equal.",
    itemIds: ["item_2"],
  },
];

const variantReferences = [
  { variantId: "variant_standard", kind: "standard" as const },
  { variantId: "variant_scaffold", kind: "scaffold" as const },
];

const privateAnswers = [
  { itemId: "item_1", correctTargetIds: ["target_1"] },
  { itemId: "item_2", correctTargetIds: ["target_2"] },
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

const provenance = {
  provider: null,
  modelVersion: null,
  promptVersion: null,
  authoredEdits: [],
};

const buildFixture = () => {
  const backend = createSeededRecordBackend({
    tenants: [
      {
        id: tenantId,
        slug: "test-school",
        name: "Test school",
        synthetic_data_only: true,
        created_at: createdAt,
      },
    ],
    actors: [
      {
        id: teacherActorId,
        display_name: "Teacher",
        is_active: true,
        authorization_revision: 1,
        created_at: createdAt,
      },
      {
        id: studentActorId,
        display_name: "Student",
        is_active: true,
        authorization_revision: 1,
        created_at: createdAt,
      },
    ],
    memberships: [
      {
        id: teacherMembershipId,
        actor_id: teacherActorId,
        tenant_id: tenantId,
        role: "teacher",
        status: "active",
        learner_id: null,
        revision: 1,
        created_at: createdAt,
      },
      {
        id: studentMembershipId,
        actor_id: studentActorId,
        tenant_id: tenantId,
        role: "student",
        status: "active",
        learner_id: learnerId,
        revision: 1,
        created_at: createdAt,
      },
    ],
    identity_sessions: [
      {
        session_id: "session_teacher",
        actor_id: teacherActorId,
        membership_id: teacherMembershipId,
        tenant_id: tenantId,
        authorization_revision: 1,
        revision: 1,
        revoked_at: null,
        absolute_expires_at: expiresAt,
        created_at: createdAt,
      },
      {
        session_id: "session_student",
        actor_id: studentActorId,
        membership_id: studentMembershipId,
        tenant_id: tenantId,
        authorization_revision: 1,
        revision: 1,
        revoked_at: null,
        absolute_expires_at: expiresAt,
        created_at: createdAt,
      },
      {
        session_id: "session_revoked",
        actor_id: studentActorId,
        membership_id: studentMembershipId,
        tenant_id: tenantId,
        authorization_revision: 1,
        revision: 1,
        revoked_at: createdAt,
        absolute_expires_at: expiresAt,
        created_at: createdAt,
      },
    ],
    identities: [
      {
        id: learnerId,
        tenant_id: tenantId,
        role: "student",
        is_active: true,
        created_at: createdAt,
      },
    ],
    standards: [
      {
        id: standardId,
        tenant_id: tenantId,
        code: "4.NF.A.1",
        name: "Explain equivalent fractions",
        created_at: createdAt,
      },
    ],
    prerequisite_nodes: [
      {
        id: conceptId,
        tenant_id: tenantId,
        standard_id: standardId,
      },
    ],
  });

  return { backend, records: createRecordCommands(backend) };
};

const appendInput = (overrides: Record<string, unknown> = {}) => ({
  operationKey: "append-version-key-1",
  package: {
    id: "package_test",
    title: "Equivalent fractions",
    standardId,
  },
  expectedHeadRevision: 0,
  revisionKind: "initial",
  parentVersionId: null,
  predecessorVersionId: null,
  curatedReferenceId: "curated_placeholder",
  generationRequestId: null,
  conceptIds: [conceptId],
  variantReferences,
  objectiveHash: "a".repeat(64),
  sections,
  provenance,
  changedSectionIds: [],
  ruleVersions,
  validationResult,
  privateAnswerRelationships: privateAnswers,
  ...overrides,
});

describe("record commands", () => {
  it("runs the focused loop end to end and replays committed operations", async () => {
    const { records } = buildFixture();

    const grounding = await records.storeGrounding(teacher, {
      operationKey: "store-grounding-key-1",
      standardId,
      referenceKey: "equivalent-fractions",
      referenceVersion: "2026-10",
      title: "Equivalent fractions",
      attribution: "Synthetic curriculum fixture",
      sourceLocator: "fixture://equivalent-fractions",
      reviewedContent: reviewContent,
    });

    const version = await records.appendVersion(
      teacher,
      appendInput({ curatedReferenceId: grounding.id })
    );

    const contentHash = createContentHash({
      conceptIds: [conceptId],
      sections,
      variantReferences,
    });
    const privateAnswerDigest = createPrivateAnswerDigest(privateAnswers);
    const packageHash = createPackageHash({
      contentHash,
      privateAnswerDigest,
    });
    const validationResultHash = createValidationResultHash(validationResult);

    const publishInput = {
      operationKey: "publish-key-1",
      versionId: version.id,
      contentHash,
      packageHash,
      privateAnswerDigest,
      validationResultHash,
      ruleVersions,
    };

    const publication = await records.publish(teacher, publishInput);
    const replay = await records.publish(teacher, publishInput);
    expect(replay.id).toBe(publication.id);

    const assignment = await records.assign(teacher, {
      operationKey: "assign-key-1",
      publicationId: publication.id,
      learnerId,
      classId,
    });

    const run = await records.startRun(student, {
      operationKey: "start-run-key-1",
      assignmentId: assignment.id,
      assignedVariantId: "variant_standard",
    });

    const hint = await records.recordHint(student, {
      operationKey: "record-hint-key-1",
      runId: run.id,
      itemId: "item_1",
      expectedRunRevision: 0,
    });

    const attempt = await records.recordAttempt(student, {
      operationKey: "record-attempt-key-1",
      runId: run.id,
      itemId: "item_1",
      expectedRunRevision: 1,
      priorAttemptId: null,
      selectedPairs: [{ sourceId: "source_1", targetId: "target_1" }],
      assistanceState: "hinted",
      assistanceEventIds: [hint.id],
      score: 100,
      correctness: "correct",
      gradingRuleVersion: "matching-grader-v1",
    });

    const evidence = await records.readEvidence(teacher, {
      runId: run.id,
    });
    expect(evidence.attempts).toHaveLength(1);
    expect(evidence.assistanceEvents).toHaveLength(1);
    expect(evidence.revision).toBe(2);

    const decision = await records.choose(teacher, {
      operationKey: "choose-key-1",
      runId: run.id,
      expectedRunRevision: evidence.revision,
      evidenceHash: evidence.evidenceHash,
      proposal: { ruleVersion: "decision-rule-v1", summary: "Continue." },
      action: "accept",
      approvedTargetId: "item_2",
    });
    expect(decision.id).toBeTruthy();

    const lesson = await records.readLesson(student, { runId: run.id });
    expect(lesson.lesson.assignedVariantId).toBe("variant_standard");
    expect(lesson.evidence.attempts).toHaveLength(1);

    const serialized = JSON.stringify(lesson);
    expect(serialized).not.toContain("privateAnswerRelationships");
    expect(serialized).not.toContain("contentHash");

    const attemptId = attempt.id;
    expect(
      (await records.readEvidence(teacher, { runId: run.id })).decisions
    ).toHaveLength(1);
    expect(attemptId).toBeTruthy();
  });

  it("rejects a changed input under an existing operation key", async () => {
    const { records } = buildFixture();
    const grounding = await records.storeGrounding(teacher, {
      operationKey: "store-grounding-key-2",
      standardId,
      referenceKey: "equivalent-fractions",
      referenceVersion: "2026-10",
      title: "Equivalent fractions",
      attribution: "Synthetic curriculum fixture",
      sourceLocator: "fixture://equivalent-fractions",
      reviewedContent: reviewContent,
    });
    const version = await records.appendVersion(
      teacher,
      appendInput({ curatedReferenceId: grounding.id })
    );

    const contentHash = createContentHash({
      conceptIds: [conceptId],
      sections,
      variantReferences,
    });
    const privateAnswerDigest = createPrivateAnswerDigest(privateAnswers);
    const packageHash = createPackageHash({ contentHash, privateAnswerDigest });
    const validationResultHash = createValidationResultHash(validationResult);

    await records.publish(teacher, {
      operationKey: "publish-key-2",
      versionId: version.id,
      contentHash,
      packageHash,
      privateAnswerDigest,
      validationResultHash,
      ruleVersions,
    });

    await expect(
      records.publish(teacher, {
        operationKey: "publish-key-2",
        versionId: version.id,
        contentHash: "b".repeat(64),
        packageHash,
        privateAnswerDigest,
        validationResultHash,
        ruleVersions,
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("rejects stale revisions without writing a record", async () => {
    const { records } = buildFixture();
    const grounding = await records.storeGrounding(teacher, {
      operationKey: "store-grounding-key-3",
      standardId,
      referenceKey: "equivalent-fractions",
      referenceVersion: "2026-10",
      title: "Equivalent fractions",
      attribution: "Synthetic curriculum fixture",
      sourceLocator: "fixture://equivalent-fractions",
      reviewedContent: reviewContent,
    });

    await records.appendVersion(
      teacher,
      appendInput({ curatedReferenceId: grounding.id })
    );

    await expect(
      records.appendVersion(
        teacher,
        appendInput({
          operationKey: "append-version-key-3b",
          curatedReferenceId: grounding.id,
        })
      )
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("denies out-of-scope actions and revoked sessions", async () => {
    const { records } = buildFixture();

    await expect(
      records.publish(student, {
        operationKey: "publish-student-key",
        versionId: "version_missing",
        contentHash: "a".repeat(64),
        packageHash: "a".repeat(64),
        privateAnswerDigest: "a".repeat(64),
        validationResultHash: "a".repeat(64),
        ruleVersions,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      records.startRun(teacher, {
        operationKey: "start-run-teacher-key",
        assignmentId: "assignment_missing",
        assignedVariantId: "variant_standard",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const revoked = buildActor("student", "session_revoked");
    await expect(
      records.readLesson(revoked, { runId: "run_missing" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const otherTenantTeacher: Actor = {
      ...teacher,
      tenantId: otherTenantId,
    };
    await expect(
      records.storeGrounding(otherTenantTeacher, {
        operationKey: "store-grounding-other-tenant",
        standardId,
        referenceKey: "equivalent-fractions",
        referenceVersion: "2026-10",
        title: "Equivalent fractions",
        attribution: "Synthetic curriculum fixture",
        sourceLocator: "fixture://equivalent-fractions",
        reviewedContent: reviewContent,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rolls back a failed append, leaving no package behind", async () => {
    const { backend, records } = buildFixture();
    const grounding = await records.storeGrounding(teacher, {
      operationKey: "store-grounding-key-5",
      standardId,
      referenceKey: "equivalent-fractions",
      referenceVersion: "2026-10",
      title: "Equivalent fractions",
      attribution: "Synthetic curriculum fixture",
      sourceLocator: "fixture://equivalent-fractions",
      reviewedContent: reviewContent,
    });

    await expect(
      records.appendVersion(
        teacher,
        appendInput({
          operationKey: "append-version-key-5",
          package: {
            id: "package_rollback",
            title: "Equivalent fractions",
            standardId,
          },
          curatedReferenceId: grounding.id,
          conceptIds: ["concept_missing"],
        })
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const packageRow = await backend.findOne(undefined, "lesson_packages", {
      tenant_id: tenantId,
      id: "package_rollback",
    });
    expect(packageRow).toBeUndefined();
  });

  it("keeps every revision and reads the history newest first", async () => {
    const { records } = buildFixture();
    const grounding = await records.storeGrounding(teacher, {
      operationKey: "store-grounding-key-6",
      standardId,
      referenceKey: "equivalent-fractions",
      referenceVersion: "2026-10",
      title: "Equivalent fractions",
      attribution: "Synthetic curriculum fixture",
      sourceLocator: "fixture://equivalent-fractions",
      reviewedContent: reviewContent,
    });

    const first = await records.appendVersion(
      teacher,
      appendInput({ curatedReferenceId: grounding.id })
    );

    await records.appendVersion(
      teacher,
      appendInput({
        operationKey: "append-version-key-6b",
        expectedHeadRevision: 1,
        revisionKind: "section-revision",
        parentVersionId: first.id,
        curatedReferenceId: grounding.id,
        changedSectionIds: ["section_worked"],
      })
    );

    const authoring = await records.readAuthoring(teacher, {
      kind: "package",
      packageId: "package_test",
    });
    expect(authoring.versions.map((version) => version.revision)).toEqual([
      2, 1,
    ]);
  });
});
