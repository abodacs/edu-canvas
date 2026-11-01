import {
  parseActorId,
  parseClassId,
  parseLearnerId,
  parseMembershipId,
  parseTenantId,
} from "../identity/identifiers";
import {
  createContentHash,
  createPackageHash,
  createPrivateAnswerDigest,
  createValidationResultHash,
} from "../records/hashes";
import { hashVersion } from "../records/vocabulary";
import { createRecordCommands } from "./records-commands";
import { createSeededRecordBackend } from "./records-seeded";
import type {
  AppendVersionInput,
  AssignInput,
  ChooseInput,
  PublishInput,
  RecordAttemptInput,
  RecordHintInput,
  StartRunInput,
} from "../records/inputs";
import type { RecordPersistence } from "./records-commands";
import type { SeededRecordBackend } from "./records-seeded";
import type { Actor } from "../identity/types";

export const fixtureTenantId = parseTenantId("tenant_records_policy");
export const fixtureOtherTenantId = parseTenantId("tenant_records_foreign");
export const fixtureTeacherActorId = parseActorId("actor_teacher_policy");
export const fixtureStudentActorId = parseActorId("actor_student_policy");
export const fixtureTeacherMembershipId = parseMembershipId(
  "membership_teacher_policy"
);
export const fixtureStudentMembershipId = parseMembershipId(
  "membership_student_policy"
);
export const fixtureLearnerId = parseLearnerId("learner_policy");
export const fixtureClassId = parseClassId("class_policy");
export const fixtureStandardId = "standard_policy";
export const fixtureConceptId = "concept_policy";
export const fixtureSnapshotId = "snapshot_policy";
export const fixtureRequestId = "request_policy";
export const fixtureCreatedAt = "2026-10-28T00:00:00.000Z";
export const fixtureExpiresAt = "2099-01-01T00:00:00.000Z";
const equivalentFractionsTitle = "Equivalent fractions";
const schoolName = "Test school";
const equivalentFractionsKey = "equivalent-fractions";

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
  checkedAt: fixtureCreatedAt,
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

const contentHash = createContentHash({
  conceptIds: [fixtureConceptId],
  sections,
  variantReferences,
});
const privateAnswerDigest = createPrivateAnswerDigest(privateAnswers);
const packageHash = createPackageHash({ contentHash, privateAnswerDigest });
const validationResultHash = createValidationResultHash(validationResult);

const buildActor = (
  role: "teacher" | "student",
  sessionId: string,
  tenantId = fixtureTenantId
): Actor => {
  return role === "teacher"
    ? {
        actorId: fixtureTeacherActorId,
        displayName: "Teacher",
        tenantId,
        tenantName: schoolName,
        membershipId: fixtureTeacherMembershipId,
        sessionId,
        sessionGeneration: "generation",
        authorizationRevision: 1,
        role: "teacher",
        rosterClassIds: [fixtureClassId],
      }
    : {
        actorId: fixtureStudentActorId,
        displayName: "Student",
        tenantId,
        tenantName: schoolName,
        membershipId: fixtureStudentMembershipId,
        sessionId,
        sessionGeneration: "generation",
        authorizationRevision: 1,
        role: "student",
        learnerId: fixtureLearnerId,
      };
};

export interface RecordFixture {
  readonly backend: SeededRecordBackend;
  readonly records: RecordPersistence;
  readonly teacher: Actor;
  readonly student: Actor;
  readonly foreignTeacher: Actor;
  readonly foreignStudent: Actor;
  readonly revokedTeacher: Actor;
  readonly revokedStudent: Actor;
}

export const createRecordFixture = (): RecordFixture => {
  const backend = createSeededRecordBackend({
    tenants: [
      {
        id: fixtureTenantId,
        slug: "policy-school",
        name: schoolName,
        synthetic_data_only: true,
        created_at: fixtureCreatedAt,
      },
    ],
    actors: [
      {
        id: fixtureTeacherActorId,
        display_name: "Teacher",
        is_active: true,
        authorization_revision: 1,
        created_at: fixtureCreatedAt,
      },
      {
        id: fixtureStudentActorId,
        display_name: "Student",
        is_active: true,
        authorization_revision: 1,
        created_at: fixtureCreatedAt,
      },
    ],
    memberships: [
      {
        id: fixtureTeacherMembershipId,
        actor_id: fixtureTeacherActorId,
        tenant_id: fixtureTenantId,
        role: "teacher",
        status: "active",
        learner_id: null,
        revision: 1,
        created_at: fixtureCreatedAt,
      },
      {
        id: fixtureStudentMembershipId,
        actor_id: fixtureStudentActorId,
        tenant_id: fixtureTenantId,
        role: "student",
        status: "active",
        learner_id: fixtureLearnerId,
        revision: 1,
        created_at: fixtureCreatedAt,
      },
    ],
    identity_sessions: [
      {
        session_id: "session_teacher_policy",
        actor_id: fixtureTeacherActorId,
        membership_id: fixtureTeacherMembershipId,
        tenant_id: fixtureTenantId,
        authorization_revision: 1,
        revision: 1,
        revoked_at: null,
        absolute_expires_at: fixtureExpiresAt,
        created_at: fixtureCreatedAt,
      },
      {
        session_id: "session_student_policy",
        actor_id: fixtureStudentActorId,
        membership_id: fixtureStudentMembershipId,
        tenant_id: fixtureTenantId,
        authorization_revision: 1,
        revision: 1,
        revoked_at: null,
        absolute_expires_at: fixtureExpiresAt,
        created_at: fixtureCreatedAt,
      },
      {
        session_id: "session_teacher_revoked",
        actor_id: fixtureTeacherActorId,
        membership_id: fixtureTeacherMembershipId,
        tenant_id: fixtureTenantId,
        authorization_revision: 1,
        revision: 1,
        revoked_at: fixtureCreatedAt,
        absolute_expires_at: fixtureExpiresAt,
        created_at: fixtureCreatedAt,
      },
      {
        session_id: "session_student_revoked",
        actor_id: fixtureStudentActorId,
        membership_id: fixtureStudentMembershipId,
        tenant_id: fixtureTenantId,
        authorization_revision: 1,
        revision: 1,
        revoked_at: fixtureCreatedAt,
        absolute_expires_at: fixtureExpiresAt,
        created_at: fixtureCreatedAt,
      },
    ],
    identities: [
      {
        id: fixtureLearnerId,
        tenant_id: fixtureTenantId,
        role: "student",
        is_active: true,
        created_at: fixtureCreatedAt,
      },
    ],
    standards: [
      {
        id: fixtureStandardId,
        tenant_id: fixtureTenantId,
        code: "4.NF.A.1",
        name: "Explain equivalent fractions",
        created_at: fixtureCreatedAt,
      },
    ],
    prerequisite_nodes: [
      {
        id: fixtureConceptId,
        tenant_id: fixtureTenantId,
        standard_id: fixtureStandardId,
      },
    ],
    source_snapshots: [
      {
        id: fixtureSnapshotId,
        tenant_id: fixtureTenantId,
        teacher_id: fixtureTeacherActorId,
        standard_id: fixtureStandardId,
        mode: "upload",
        file_name: "equivalent-fractions.pdf",
        file_format: "pdf",
        file_size_bytes: 1024,
        page_count: 1,
        content_hash: null,
        extracted_text: "Equivalent fractions name the same amount.",
        state: "complete",
        gaps: [],
        failure_reason: null,
        unverified_alignment: false,
        alignment_acknowledged_at: fixtureCreatedAt,
        synthetic_material_confirmed: true,
        required_skills_confirmed_at: fixtureCreatedAt,
        reviewed_at: fixtureCreatedAt,
        used_at: null,
        expires_at: fixtureExpiresAt,
        replaces_snapshot_id: null,
        created_at: fixtureCreatedAt,
        updated_at: fixtureCreatedAt,
      },
    ],
    lesson_draft_requests: [
      {
        id: fixtureRequestId,
        tenant_id: fixtureTenantId,
        teacher_id: fixtureTeacherActorId,
      },
    ],
  });

  return {
    backend,
    records: createRecordCommands(backend),
    teacher: buildActor("teacher", "session_teacher_policy"),
    student: buildActor("student", "session_student_policy"),
    foreignTeacher: buildActor(
      "teacher",
      "session_teacher_policy",
      fixtureOtherTenantId
    ),
    foreignStudent: buildActor(
      "student",
      "session_student_policy",
      fixtureOtherTenantId
    ),
    revokedTeacher: buildActor("teacher", "session_teacher_revoked"),
    revokedStudent: buildActor("student", "session_student_revoked"),
  };
};

export type LoopStage =
  | "grounding"
  | "version"
  | "publication"
  | "assignment"
  | "run"
  | "hint"
  | "attempt"
  | "evidence";

export interface LoopResult {
  readonly groundingId: string;
  readonly versionId: string;
  readonly publicationId: string;
  readonly assignmentId: string;
  readonly runId: string;
  readonly hintId: string;
  readonly attemptId: string;
  readonly revision: number;
  readonly evidenceHash: string;
}

const emptyLoop: LoopResult = {
  groundingId: "",
  versionId: "",
  publicationId: "",
  assignmentId: "",
  runId: "",
  hintId: "",
  attemptId: "",
  revision: 0,
  evidenceHash: "",
};

export const buildLoop = async (
  fixture: RecordFixture,
  suffix: string,
  until: LoopStage
): Promise<LoopResult> => {
  const key = (name: string) => `${name}-${suffix}`;
  const grounding = await fixture.records.storeGrounding(fixture.teacher, {
    operationKey: key("store-grounding"),
    standardId: fixtureStandardId,
    referenceKey: equivalentFractionsKey,
    referenceVersion: "2026-10",
    title: equivalentFractionsTitle,
    attribution: "Synthetic curriculum fixture",
    sourceLocator: "fixture://equivalent-fractions",
    reviewedContent: reviewContent,
  });
  if (until === "grounding") {
    return { ...emptyLoop, groundingId: grounding.id };
  }

  const packageId = `package_${suffix}`;
  const version = await fixture.records.appendVersion(fixture.teacher, {
    operationKey: key("append-version"),
    package: {
      id: packageId,
      title: equivalentFractionsTitle,
      standardId: fixtureStandardId,
    },
    expectedHeadRevision: 0,
    revisionKind: "initial",
    parentVersionId: null,
    predecessorVersionId: null,
    curatedReferenceId: grounding.id,
    generationRequestId: null,
    conceptIds: [fixtureConceptId],
    variantReferences,
    objectiveHash: "a".repeat(64),
    sections,
    provenance,
    changedSectionIds: [],
    ruleVersions,
    validationResult,
    privateAnswerRelationships: privateAnswers,
  });
  if (until === "version") {
    return {
      ...emptyLoop,
      groundingId: grounding.id,
      versionId: version.id,
    };
  }

  const publication = await fixture.records.publish(fixture.teacher, {
    operationKey: key("publish"),
    versionId: version.id,
    contentHash,
    packageHash,
    privateAnswerDigest,
    validationResultHash,
    ruleVersions,
  });
  if (until === "publication") {
    return {
      ...emptyLoop,
      groundingId: grounding.id,
      versionId: version.id,
      publicationId: publication.id,
    };
  }

  const assignment = await fixture.records.assign(fixture.teacher, {
    operationKey: key("assign"),
    publicationId: publication.id,
    learnerId: fixtureLearnerId,
    classId: fixtureClassId,
  });
  if (until === "assignment") {
    return {
      ...emptyLoop,
      groundingId: grounding.id,
      versionId: version.id,
      publicationId: publication.id,
      assignmentId: assignment.id,
    };
  }

  const run = await fixture.records.startRun(fixture.student, {
    operationKey: key("start-run"),
    assignmentId: assignment.id,
    assignedVariantId: "variant_standard",
  });
  if (until === "run") {
    return {
      ...emptyLoop,
      groundingId: grounding.id,
      versionId: version.id,
      publicationId: publication.id,
      assignmentId: assignment.id,
      runId: run.id,
    };
  }

  const hint = await fixture.records.recordHint(fixture.student, {
    operationKey: key("record-hint"),
    runId: run.id,
    itemId: "item_1",
    expectedRunRevision: 0,
  });
  if (until === "hint") {
    return {
      ...emptyLoop,
      groundingId: grounding.id,
      versionId: version.id,
      publicationId: publication.id,
      assignmentId: assignment.id,
      runId: run.id,
      hintId: hint.id,
      revision: 1,
    };
  }

  const attempt = await fixture.records.recordAttempt(fixture.student, {
    operationKey: key("record-attempt"),
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
  const evidence = await fixture.records.readEvidence(fixture.teacher, {
    runId: run.id,
  });
  if (until === "attempt" || until === "evidence") {
    return {
      ...emptyLoop,
      groundingId: grounding.id,
      versionId: version.id,
      publicationId: publication.id,
      assignmentId: assignment.id,
      runId: run.id,
      hintId: hint.id,
      attemptId: attempt.id,
      revision: evidence.revision,
      evidenceHash: evidence.evidenceHash,
    };
  }

  return emptyLoop;
};

export const publishHashInput = {
  contentHash,
  packageHash,
  privateAnswerDigest,
  validationResultHash,
  ruleVersions,
};

export const groundingInput = (operationKey: string) => {
  return {
    operationKey,
    standardId: fixtureStandardId,
    referenceKey: equivalentFractionsKey,
    referenceVersion: "2026-10",
    title: equivalentFractionsTitle,
    attribution: "Synthetic curriculum fixture",
    sourceLocator: "fixture://equivalent-fractions",
    reviewedContent: reviewContent,
  };
};

export const appendVersionInput = (
  operationKey: string,
  curatedReferenceId: string,
  packageSuffix: string
): AppendVersionInput => {
  return {
    operationKey,
    package: {
      id: `package_${packageSuffix}`,
      title: equivalentFractionsTitle,
      standardId: fixtureStandardId,
    },
    expectedHeadRevision: 0,
    revisionKind: "initial",
    parentVersionId: null,
    predecessorVersionId: null,
    curatedReferenceId,
    generationRequestId: null,
    conceptIds: [fixtureConceptId],
    variantReferences,
    objectiveHash: "a".repeat(64),
    sections,
    provenance,
    changedSectionIds: [],
    ruleVersions,
    validationResult,
    privateAnswerRelationships: privateAnswers,
  };
};

export const publishInput = (
  operationKey: string,
  versionId: string
): PublishInput => {
  return {
    operationKey,
    versionId,
    ...publishHashInput,
  };
};

export const assignInput = (
  operationKey: string,
  publicationId: string
): AssignInput => {
  return {
    operationKey,
    publicationId,
    learnerId: fixtureLearnerId,
    classId: fixtureClassId,
  };
};

export const startRunInput = (
  operationKey: string,
  assignmentId: string
): StartRunInput => {
  return {
    operationKey,
    assignmentId,
    assignedVariantId: "variant_standard",
  };
};

export const recordHintInput = (
  operationKey: string,
  runId: string
): RecordHintInput => {
  return {
    operationKey,
    runId,
    itemId: "item_1",
    expectedRunRevision: 0,
  };
};

export const recordAttemptInput = (
  operationKey: string,
  runId: string,
  assistanceEventId: string
): RecordAttemptInput => {
  return {
    operationKey,
    runId,
    itemId: "item_1",
    expectedRunRevision: 1,
    priorAttemptId: null,
    selectedPairs: [{ sourceId: "source_1", targetId: "target_1" }],
    assistanceState: "hinted",
    assistanceEventIds: [assistanceEventId],
    score: 100,
    correctness: "correct",
    gradingRuleVersion: "matching-grader-v1",
  };
};

export const chooseInput = (
  operationKey: string,
  runId: string,
  expectedRunRevision: number,
  evidenceHash: string
): ChooseInput => {
  return {
    operationKey,
    runId,
    expectedRunRevision,
    evidenceHash,
    proposal: { ruleVersion: "decision-rule-v1", summary: "Continue." },
    action: "accept",
    approvedTargetId: "item_2",
  };
};

export const sectionsForTest = sections;
