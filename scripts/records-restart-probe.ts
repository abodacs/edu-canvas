import { randomUUID } from "node:crypto";

import postgres from "postgres";

import {
  parseActorId,
  parseClassId,
  parseLearnerId,
  parseMembershipId,
  parseTenantId,
} from "../src/server/identity/identifiers";
import { createRecordCommands } from "../src/server/persistence/records-commands";
import { createDrizzleRecordBackend } from "../src/server/persistence/records-drizzle";
import { createPostgresRecordBackend } from "../src/server/persistence/records-postgres";
import {
  createContentHash,
  createPackageHash,
  createPrivateAnswerDigest,
  createValidationResultHash,
} from "../src/server/records/hashes";
import { hashVersion } from "../src/server/records/vocabulary";
import type { Actor } from "../src/server/identity/types";

const processArguments = process.argv.slice(2);
const readArgument = (name: string): string | undefined => {
  const index = processArguments.indexOf(name);
  return index === -1 ? undefined : processArguments[index + 1];
};

const phase = readArgument("--phase");
const runId = readArgument("--run-id") ?? randomUUID().slice(0, 8);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the restart probe.");
}

const createdAt = "2026-10-28T00:00:00.000Z";
const expiresAt = "2099-01-01T00:00:00.000Z";
const probeSlug = `probe-${runId}`;
const learnerHandle = `probe-learner-${runId}`;
const teacherVerifier = `verifier-teacher-${runId}`;
const studentVerifier = `verifier-student-${runId}`;
const standardCode = `4.NF.A.1-${runId}`;
const equivalentFractions = "Equivalent fractions";
const equivalentFractionsKey = "equivalent-fractions";
const schoolName = "Probe school";

const tenantId = parseTenantId(`tenant_probe_${runId}`);
const teacherActorId = parseActorId(`actor_teacher_probe_${runId}`);
const studentActorId = parseActorId(`actor_student_probe_${runId}`);
const teacherMembershipId = parseMembershipId(
  `membership_teacher_probe_${runId}`
);
const studentMembershipId = parseMembershipId(
  `membership_student_probe_${runId}`
);
const learnerId = parseLearnerId(`learner_probe_${runId}`);
const classId = parseClassId(`class_probe_${runId}`);
const standardId = `standard_probe_${runId}`;
const conceptId = `concept_probe_${runId}`;
const teacherSessionId = `session_teacher_probe_${runId}`;
const studentSessionId = `session_student_probe_${runId}`;

const teacher: Actor = {
  actorId: teacherActorId,
  displayName: "Probe teacher",
  tenantId,
  tenantName: schoolName,
  membershipId: teacherMembershipId,
  sessionId: teacherSessionId,
  sessionGeneration: "probe",
  authorizationRevision: 1,
  role: "teacher",
  rosterClassIds: [classId],
};

const student: Actor = {
  actorId: studentActorId,
  displayName: "Probe student",
  tenantId,
  tenantName: schoolName,
  membershipId: studentMembershipId,
  sessionId: studentSessionId,
  sessionGeneration: "probe",
  authorizationRevision: 1,
  role: "student",
  learnerId,
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

const createFixture = async (): Promise<void> => {
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    prepare: false,
  });
  try {
    await sql.begin(async (transaction) => {
      await transaction`insert into tenants (id, slug, name, synthetic_data_only, created_at) values (${tenantId}, ${probeSlug}, ${schoolName}, true, ${createdAt})`;
      await transaction`insert into actors (id, display_name, is_active, authorization_revision, created_at) values (${teacherActorId}, ${"Probe teacher"}, true, 1, ${createdAt})`;
      await transaction`insert into actors (id, display_name, is_active, authorization_revision, created_at) values (${studentActorId}, ${"Probe student"}, true, 1, ${createdAt})`;
      await transaction`insert into identities (id, tenant_id, role, display_name, demo_handle, is_active, created_at) values (${learnerId}, ${tenantId}, 'student', ${"Probe learner"}, ${learnerHandle}, true, ${createdAt})`;
      await transaction`insert into memberships (id, actor_id, tenant_id, role, status, learner_id, revision, created_at) values (${teacherMembershipId}, ${teacherActorId}, ${tenantId}, 'teacher', 'active', null, 1, ${createdAt})`;
      await transaction`insert into memberships (id, actor_id, tenant_id, role, status, learner_id, revision, created_at) values (${studentMembershipId}, ${studentActorId}, ${tenantId}, 'student', 'active', ${learnerId}, 1, ${createdAt})`;
      await transaction`insert into identity_sessions (session_id, verifier_hash, actor_id, membership_id, tenant_id, provider_session_id, provider_subject, session_generation, authorization_revision, revision, created_at, last_activity_at, absolute_expires_at) values (${teacherSessionId}, ${teacherVerifier}, ${teacherActorId}, ${teacherMembershipId}, ${tenantId}, ${"probe"}, ${"probe"}, ${"probe"}, 1, 1, ${createdAt}, ${createdAt}, ${expiresAt})`;
      await transaction`insert into identity_sessions (session_id, verifier_hash, actor_id, membership_id, tenant_id, provider_session_id, provider_subject, session_generation, authorization_revision, revision, created_at, last_activity_at, absolute_expires_at) values (${studentSessionId}, ${studentVerifier}, ${studentActorId}, ${studentMembershipId}, ${tenantId}, ${"probe"}, ${"probe"}, ${"probe"}, 1, 1, ${createdAt}, ${createdAt}, ${expiresAt})`;
      await transaction`insert into standards (id, tenant_id, code, name, subject, grade_band, created_at) values (${standardId}, ${tenantId}, ${standardCode}, ${"Explain equivalent fractions"}, ${"Math"}, ${"Grade 4"}, ${createdAt})`;
      await transaction`insert into prerequisite_nodes (id, tenant_id, standard_id, label, sequence, created_at) values (${conceptId}, ${tenantId}, ${standardId}, ${"Equal parts"}, 1, ${createdAt})`;
    });
  } finally {
    await sql.end({ timeout: 3 });
  }
};

const destroyFixture = async (): Promise<void> => {
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    prepare: false,
  });
  try {
    await sql.begin(async (transaction) => {
      await transaction`set session_replication_role = replica`;
      await transaction`select set_config('app.tenant_id', ${tenantId}, true)`;
      await transaction`delete from learner_attempts where tenant_id = ${tenantId}`;
      await transaction`delete from teacher_decisions where tenant_id = ${tenantId}`;
      await transaction`delete from assistance_events where tenant_id = ${tenantId}`;
      await transaction`delete from learner_runs where tenant_id = ${tenantId}`;
      await transaction`delete from assignments where tenant_id = ${tenantId}`;
      await transaction`delete from publications where tenant_id = ${tenantId}`;
      await transaction`delete from lesson_versions where tenant_id = ${tenantId}`;
      await transaction`delete from lesson_packages where tenant_id = ${tenantId}`;
      await transaction`delete from curated_references where tenant_id = ${tenantId}`;
      await transaction`delete from operation_receipts where tenant_id = ${tenantId}`;
      await transaction`delete from identity_sessions where tenant_id = ${tenantId}`;
      await transaction`delete from memberships where tenant_id = ${tenantId}`;
      await transaction`delete from prerequisite_nodes where tenant_id = ${tenantId}`;
      await transaction`delete from standards where tenant_id = ${tenantId}`;
      await transaction`delete from identities where tenant_id = ${tenantId}`;
      await transaction`delete from actors where id in (${teacherActorId}, ${studentActorId})`;
      await transaction`delete from tenants where id = ${tenantId}`;
    });
  } finally {
    await sql.end({ timeout: 3 });
  }
};

const contentHash = createContentHash({
  conceptIds: [conceptId],
  sections,
  variantReferences,
});
const privateAnswerDigest = createPrivateAnswerDigest(privateAnswers);
const packageHash = createPackageHash({ contentHash, privateAnswerDigest });
const validationResultHash = createValidationResultHash(validationResult);

const writePhase = async (): Promise<void> => {
  await createFixture();
  const records = createRecordCommands(
    createPostgresRecordBackend({ databaseUrl })
  );
  const grounding = await records.storeGrounding(teacher, {
    operationKey: `probe-grounding-${runId}`,
    standardId,
    referenceKey: equivalentFractionsKey,
    referenceVersion: "2026-10",
    title: equivalentFractions,
    attribution: "Probe fixture",
    sourceLocator: "fixture://equivalent-fractions",
    reviewedContent: {
      summary: "Equivalent fractions name the same amount.",
      keyIdeas: ["Multiply both parts by the same number."],
      workedExample: "1/2 = 2/4.",
      commonMisconceptions: ["Adding the same number to both parts."],
    },
  });
  const version = await records.appendVersion(teacher, {
    operationKey: `probe-append-${runId}`,
    package: {
      id: `package_probe_${runId}`,
      title: equivalentFractions,
      standardId,
    },
    expectedHeadRevision: 0,
    revisionKind: "initial",
    parentVersionId: null,
    predecessorVersionId: null,
    curatedReferenceId: grounding.id,
    generationRequestId: null,
    conceptIds: [conceptId],
    variantReferences,
    objectiveHash: "a".repeat(64),
    sections,
    provenance: {
      provider: null,
      modelVersion: null,
      promptVersion: null,
      authoredEdits: [],
    },
    changedSectionIds: [],
    ruleVersions,
    validationResult,
    privateAnswerRelationships: privateAnswers,
  });
  const publication = await records.publish(teacher, {
    operationKey: `probe-publish-${runId}`,
    versionId: version.id,
    contentHash,
    packageHash,
    privateAnswerDigest,
    validationResultHash,
    ruleVersions,
  });
  const assignment = await records.assign(teacher, {
    operationKey: `probe-assign-${runId}`,
    publicationId: publication.id,
    learnerId,
    classId,
  });
  const run = await records.startRun(student, {
    operationKey: `probe-run-${runId}`,
    assignmentId: assignment.id,
    assignedVariantId: "variant_standard",
  });
  const hint = await records.recordHint(student, {
    operationKey: `probe-hint-${runId}`,
    runId: run.id,
    itemId: "item_1",
    expectedRunRevision: 0,
  });
  const attempt = await records.recordAttempt(student, {
    operationKey: `probe-attempt-${runId}`,
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
  const evidence = await records.readEvidence(teacher, { runId: run.id });
  await records.choose(teacher, {
    operationKey: `probe-choose-${runId}`,
    runId: run.id,
    expectedRunRevision: evidence.revision,
    evidenceHash: evidence.evidenceHash,
    proposal: { ruleVersion: "decision-rule-v1", summary: "Continue." },
    action: "accept",
    approvedTargetId: "item_2",
  });

  process.stdout.write(
    JSON.stringify({
      runId,
      tenantId,
      publicationId: publication.id,
      learnerRunId: run.id,
      attemptId: attempt.id,
    })
  );
};

const readPhase = async (): Promise<void> => {
  const learnerRunId = readArgument("--learner-run-id");
  if (!learnerRunId) {
    throw new Error("--learner-run-id is required for --phase read.");
  }
  const records = createRecordCommands(
    createDrizzleRecordBackend({ databaseUrl })
  );
  const evidence = await records.readEvidence(teacher, {
    runId: learnerRunId,
  });
  const lesson = await records.readLesson(student, {
    runId: learnerRunId,
  });
  process.stdout.write(
    JSON.stringify({
      ok: evidence.attempts.length === 1 && evidence.decisions.length === 1,
      runId,
      attempts: evidence.attempts.length,
      decisions: evidence.decisions.length,
      stage: lesson.lesson.stage,
    })
  );
  await destroyFixture();
};

if (phase === "write") {
  await writePhase();
} else if (phase === "read") {
  await readPhase();
} else {
  throw new Error("Use --phase write or --phase read.");
}
