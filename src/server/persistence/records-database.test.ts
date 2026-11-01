import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
import { createPostgresRecordBackend } from "./records-postgres";
import { createRecordCommands } from "./records-commands";
import type { Actor } from "../identity/types";

const databaseUrl = process.env.DATABASE_URL;
const isEnabled = process.env.RUN_DATABASE_TESTS === "true";
const isRun = Boolean(databaseUrl && isEnabled);

const requireUrl = (): string => {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the record database tests.");
  }
  return databaseUrl;
};

const createdAt = "2026-10-28T00:00:00.000Z";
const expiresAt = "2099-01-01T00:00:00.000Z";

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

interface Fixture {
  readonly runId: string;
  readonly tenantId: string;
  readonly otherTenantId: string;
  readonly standardId: string;
  readonly conceptId: string;
  readonly teacherActorId: string;
  readonly studentActorId: string;
  readonly teacher: Actor;
  readonly student: Actor;
  readonly learnerId: string;
  readonly classId: string;
}

const createFixture = async (suffix: string): Promise<Fixture> => {
  const runId = randomUUID().slice(0, 8);
  const tenantId = `tenant_records_${suffix}_${runId}`;
  const otherTenantId = `tenant_records_other_${suffix}_${runId}`;
  const teacherActorId = `actor_teacher_${suffix}_${runId}`;
  const studentActorId = `actor_student_${suffix}_${runId}`;
  const teacherMembershipId = `membership_teacher_${suffix}_${runId}`;
  const studentMembershipId = `membership_student_${suffix}_${runId}`;
  const learnerId = `learner_${suffix}_${runId}`;
  const standardId = `standard_${suffix}_${runId}`;
  const conceptId = `concept_${suffix}_${runId}`;
  const classId = `class_${suffix}_${runId}`;
  const tenantSlug = `slug-${runId}`;
  const otherTenantSlug = `slug-other-${runId}`;
  const learnerHandle = `learner-${runId}`;
  const teacherSessionId = `session_teacher_${runId}`;
  const studentSessionId = `session_student_${runId}`;
  const teacherVerifier = `verifier_teacher_${runId}`;
  const studentVerifier = `verifier_student_${runId}`;
  const standardCode = `4.NF.A.1-${runId}`;

  const sql = postgres(requireUrl(), {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    prepare: false,
  });

  try {
    await sql.begin(async (transaction) => {
      await transaction`insert into tenants (id, slug, name, synthetic_data_only, created_at) values (${tenantId}, ${tenantSlug}, ${"Test school"}, true, ${createdAt})`;
      await transaction`insert into tenants (id, slug, name, synthetic_data_only, created_at) values (${otherTenantId}, ${otherTenantSlug}, ${"Other school"}, true, ${createdAt})`;
      await transaction`insert into actors (id, display_name, is_active, authorization_revision, created_at) values (${teacherActorId}, ${"Teacher"}, true, 1, ${createdAt})`;
      await transaction`insert into actors (id, display_name, is_active, authorization_revision, created_at) values (${studentActorId}, ${"Student"}, true, 1, ${createdAt})`;
      await transaction`insert into identities (id, tenant_id, role, display_name, demo_handle, is_active, created_at) values (${learnerId}, ${tenantId}, 'student', ${"Learner"}, ${learnerHandle}, true, ${createdAt})`;
      await transaction`insert into memberships (id, actor_id, tenant_id, role, status, learner_id, revision, created_at) values (${teacherMembershipId}, ${teacherActorId}, ${tenantId}, 'teacher', 'active', null, 1, ${createdAt})`;
      await transaction`insert into memberships (id, actor_id, tenant_id, role, status, learner_id, revision, created_at) values (${studentMembershipId}, ${studentActorId}, ${tenantId}, 'student', 'active', ${learnerId}, 1, ${createdAt})`;
      await transaction`insert into identity_sessions (session_id, verifier_hash, actor_id, membership_id, tenant_id, provider_session_id, provider_subject, session_generation, authorization_revision, revision, created_at, last_activity_at, absolute_expires_at) values (${teacherSessionId}, ${teacherVerifier}, ${teacherActorId}, ${teacherMembershipId}, ${tenantId}, ${"provider-session"}, ${"provider-subject"}, ${"generation"}, 1, 1, ${createdAt}, ${createdAt}, ${expiresAt})`;
      await transaction`insert into identity_sessions (session_id, verifier_hash, actor_id, membership_id, tenant_id, provider_session_id, provider_subject, session_generation, authorization_revision, revision, created_at, last_activity_at, absolute_expires_at) values (${studentSessionId}, ${studentVerifier}, ${studentActorId}, ${studentMembershipId}, ${tenantId}, ${"provider-session"}, ${"provider-subject"}, ${"generation"}, 1, 1, ${createdAt}, ${createdAt}, ${expiresAt})`;
      await transaction`insert into standards (id, tenant_id, code, name, subject, grade_band, created_at) values (${standardId}, ${tenantId}, ${standardCode}, ${"Explain equivalent fractions"}, ${"Math"}, ${"Grade 4"}, ${createdAt})`;
      await transaction`insert into prerequisite_nodes (id, tenant_id, standard_id, label, sequence, created_at) values (${conceptId}, ${tenantId}, ${standardId}, ${"Equal parts"}, 1, ${createdAt})`;
    });
  } finally {
    await sql.end({ timeout: 3 });
  }

  const teacher: Actor = {
    actorId: parseActorId(teacherActorId),
    displayName: "Teacher",
    tenantId: parseTenantId(tenantId),
    tenantName: "Test school",
    membershipId: parseMembershipId(teacherMembershipId),
    sessionId: teacherSessionId,
    sessionGeneration: "generation",
    authorizationRevision: 1,
    role: "teacher",
    rosterClassIds: [parseClassId(classId)],
  };
  const student: Actor = {
    actorId: parseActorId(studentActorId),
    displayName: "Student",
    tenantId: parseTenantId(tenantId),
    tenantName: "Test school",
    membershipId: parseMembershipId(studentMembershipId),
    sessionId: studentSessionId,
    sessionGeneration: "generation",
    authorizationRevision: 1,
    role: "student",
    learnerId: parseLearnerId(learnerId),
  };

  return {
    runId,
    tenantId,
    otherTenantId,
    standardId,
    conceptId,
    teacherActorId,
    studentActorId,
    teacher,
    student,
    learnerId,
    classId,
  };
};

const deleteFixture = async (fixture: Fixture): Promise<void> => {
  const sql = postgres(requireUrl(), {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    prepare: false,
  });
  try {
    await sql.begin(async (transaction) => {
      // Test-only cleanup: immutable triggers block deletes, so the fixture
      // removal runs with triggers suspended. Production never deletes these.
      await transaction`set session_replication_role = replica`;
      await transaction`select set_config('app.tenant_id', ${fixture.tenantId}, true)`;
      await transaction`delete from learner_attempts where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from teacher_decisions where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from assistance_events where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from learner_runs where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from assignments where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from publications where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from lesson_versions where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from lesson_packages where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from curated_references where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from operation_receipts where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from identity_sessions where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from memberships where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from prerequisite_nodes where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from standards where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from identities where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from actors where id in (${fixture.teacherActorId}, ${fixture.studentActorId})`;
      await transaction`delete from tenants where id in (${fixture.tenantId}, ${fixture.otherTenantId})`;
    });
  } finally {
    await sql.end({ timeout: 3 });
  }
};

const appendInput = (fixture: Fixture, curatedReferenceId: string) => {
  return {
    operationKey: `append-version-key-${curatedReferenceId}`,
    package: {
      id: `package_${curatedReferenceId}`,
      title: "Equivalent fractions",
      standardId: fixture.standardId,
    },
    expectedHeadRevision: 0,
    revisionKind: "initial",
    parentVersionId: null,
    predecessorVersionId: null,
    curatedReferenceId,
    generationRequestId: null,
    conceptIds: [fixture.conceptId],
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

const expectFocusedLoop = async (
  createRecords: () => ReturnType<typeof createRecordCommands>,
  fixture: Fixture,
  suffix: string
): Promise<{ publicationId: string; runId: string }> => {
  const records = createRecords();

  const grounding = await records.storeGrounding(fixture.teacher, {
    operationKey: `store-grounding-key-${fixture.tenantId}-${suffix}`,
    standardId: fixture.standardId,
    referenceKey: "equivalent-fractions",
    referenceVersion: "2026-10",
    title: "Equivalent fractions",
    attribution: "Synthetic curriculum fixture",
    sourceLocator: "fixture://equivalent-fractions",
    reviewedContent: reviewContent,
  });

  const version = await records.appendVersion(
    fixture.teacher,
    appendInput(fixture, grounding.id)
  );

  const contentHash = createContentHash({
    conceptIds: [fixture.conceptId],
    sections,
    variantReferences,
  });
  const privateAnswerDigest = createPrivateAnswerDigest(privateAnswers);
  const packageHash = createPackageHash({ contentHash, privateAnswerDigest });
  const validationResultHash = createValidationResultHash(validationResult);

  const publication = await records.publish(fixture.teacher, {
    operationKey: `publish-key-${fixture.tenantId}-${suffix}`,
    versionId: version.id,
    contentHash,
    packageHash,
    privateAnswerDigest,
    validationResultHash,
    ruleVersions,
  });

  const assignment = await records.assign(fixture.teacher, {
    operationKey: `assign-key-${fixture.tenantId}-${suffix}`,
    publicationId: publication.id,
    learnerId: fixture.learnerId,
    classId: fixture.classId,
  });

  const run = await records.startRun(fixture.student, {
    operationKey: `start-run-key-${fixture.tenantId}-${suffix}`,
    assignmentId: assignment.id,
    assignedVariantId: "variant_standard",
  });

  const hint = await records.recordHint(fixture.student, {
    operationKey: `record-hint-key-${fixture.tenantId}-${suffix}`,
    runId: run.id,
    itemId: "item_1",
    expectedRunRevision: 0,
  });

  await records.recordAttempt(fixture.student, {
    operationKey: `record-attempt-key-${fixture.tenantId}-${suffix}`,
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

  const evidence = await records.readEvidence(fixture.teacher, {
    runId: run.id,
  });

  expect(evidence.attempts).toHaveLength(1);
  expect(evidence.assistanceEvents).toHaveLength(1);

  await records.choose(fixture.teacher, {
    operationKey: `choose-key-${fixture.tenantId}-${suffix}`,
    runId: run.id,
    expectedRunRevision: evidence.revision,
    evidenceHash: evidence.evidenceHash,
    proposal: { ruleVersion: "decision-rule-v1", summary: "Continue." },
    action: "accept",
    approvedTargetId: "item_2",
  });

  const lesson = await records.readLesson(fixture.student, { runId: run.id });

  expect(lesson.evidence.attempts).toHaveLength(1);

  return { publicationId: publication.id, runId: run.id };
};

describe.skipIf(!isRun)("record database parity", () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await createFixture("parity");
    const sql = postgres(requireUrl(), {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
      prepare: false,
    });
    try {
      await sql`do $$ begin if not exists (select from pg_roles where rolname = 'edu_canvas_runtime') then create role edu_canvas_runtime nosuperuser nobypassrls; end if; end $$`;
      await sql`grant usage on schema public to edu_canvas_runtime`;
      await sql`grant select on all tables in schema public to edu_canvas_runtime`;
    } finally {
      await sql.end({ timeout: 3 });
    }
  });

  afterAll(async () => {
    await deleteFixture(fixture);
  });

  it.each([
    [
      "postgres",
      () => {
        return createRecordCommands(
          createPostgresRecordBackend({ databaseUrl: requireUrl() })
        );
      },
    ],
  ] as const)(
    "runs the focused loop on the %s adapter",
    async (_name, create) => {
      const result = await expectFocusedLoop(create, fixture, _name);

      expect(result.publicationId).toBeTruthy();
    }
  );

  it("rejects a direct change to an immutable record", async () => {
    const { publicationId } = await expectFocusedLoop(
      () => {
        return createRecordCommands(
          createPostgresRecordBackend({ databaseUrl: requireUrl() })
        );
      },
      fixture,
      "immutable"
    );
    const sql = postgres(requireUrl(), {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
      prepare: false,
    });
    try {
      await expect(
        sql`update publications set content_hash = ${"b".repeat(64)} where id = ${publicationId}`
      ).rejects.toThrow(/Immutable foundation rows/u);
    } finally {
      await sql.end({ timeout: 3 });
    }
  });

  it("hides another tenant's record from a non-bypass role", async () => {
    const { publicationId } = await expectFocusedLoop(
      () => {
        return createRecordCommands(
          createPostgresRecordBackend({ databaseUrl: requireUrl() })
        );
      },
      fixture,
      "rls"
    );
    const sql = postgres(requireUrl(), {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
      prepare: false,
    });
    try {
      const count = await sql.begin(async (transaction) => {
        await transaction`grant select on all tables in schema public to edu_canvas_runtime`;
        await transaction`select set_config('app.tenant_id', ${fixture.otherTenantId}, true)`;
        await transaction`set local role edu_canvas_runtime`;
        const rows =
          await transaction`select count(*)::int as count from publications where id = ${publicationId}`;
        return rows[0]?.count as number;
      });

      expect(count).toBe(0);
    } finally {
      await sql.end({ timeout: 3 });
    }
  });
});
