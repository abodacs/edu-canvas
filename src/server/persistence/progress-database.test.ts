import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLearnerService } from "@/server/learner/service";
import { replayNextActivity } from "@/server/learner/decision";
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
import type { ActivityOption } from "@/server/learner/decision";
import type { Actor } from "../identity/types";

/**
 * #8 database contract for the teacher progress read model. It gates itself on
 * RUN_DATABASE_TESTS and a configured DATABASE_URL, and proves the replay
 * (AC2), the refresh immutability (AC1), and the tenant/assignment boundaries
 * (AC3) against real PostgreSQL.
 */

const databaseUrl = process.env.DATABASE_URL;
const isRun = process.env.RUN_DATABASE_TESTS === "true" && Boolean(databaseUrl);

const requireUrl = (): string => {
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for the progress database tests."
    );
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
  { variantId: "variant_standard_b", kind: "standard" as const },
  { variantId: "variant_scaffold", kind: "scaffold" as const },
];

const variantOptions: readonly ActivityOption[] = variantReferences.map(
  (variant) => ({ activityId: variant.variantId, kind: variant.kind })
);

const privateAnswers = [
  { itemId: "item_1", correctTargetIds: ["target_1"] },
  { itemId: "item_2", correctTargetIds: ["target_2"] },
];

const approvedCopy = {
  schemaVersion: "approved-copy-v1" as const,
  language: "en" as const,
  path: {
    rationale:
      "Both fractions describe the same part because equal parts keep the same value.",
  },
  variants: [
    {
      variantId: "variant_standard",
      feedback: {
        correct: "Yes. Both names describe the same part.",
        incorrect: "Not yet. Multiply both parts by the same number.",
      },
      columns: { sourceLabel: "Fractions", targetLabel: "Equivalents" },
    },
    {
      variantId: "variant_standard_b",
      feedback: {
        correct: "Yes. Both names describe the same part.",
        incorrect: "Not yet. Multiply both parts by the same number.",
      },
      columns: { sourceLabel: "Fractions", targetLabel: "Equivalents" },
    },
    {
      variantId: "variant_scaffold",
      feedback: {
        correct: "Yes. The bar shows the same part.",
        incorrect: "Look at the bar again, then try one pair.",
      },
      columns: { sourceLabel: "Fractions", targetLabel: "Equivalents" },
    },
  ],
};

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
  readonly tag: string;
  readonly tenantId: string;
  readonly otherTenantId: string;
  readonly standardId: string;
  readonly conceptId: string;
  readonly classId: string;
  readonly learnerId: string;
  readonly teacher: Actor;
  readonly student: Actor;
  readonly colleague: Actor;
  readonly foreignTeacher: Actor;
}

const createFixture = async (tag: string): Promise<Fixture> => {
  const unique = `${tag}_${randomUUID().slice(0, 8)}`;
  const tenantId = parseTenantId(`tenant_progress_${unique}`);
  const otherTenantId = parseTenantId(`tenant_progress_other_${unique}`);
  const teacherActorId = parseActorId(`actor_progress_teacher_${unique}`);
  const colleagueActorId = parseActorId(`actor_progress_colleague_${unique}`);
  const foreignActorId = parseActorId(`actor_progress_foreign_${unique}`);
  const studentActorId = parseActorId(`actor_progress_student_${unique}`);
  const teacherMembershipId = parseMembershipId(
    `membership_progress_teacher_${unique}`
  );
  const colleagueMembershipId = parseMembershipId(
    `membership_progress_colleague_${unique}`
  );
  const foreignMembershipId = parseMembershipId(
    `membership_progress_foreign_${unique}`
  );
  const studentMembershipId = parseMembershipId(
    `membership_progress_student_${unique}`
  );
  const learnerId = parseLearnerId(`learner_progress_${unique}`);
  const classId = parseClassId(`class_progress_${unique}`);
  const standardId = `standard_progress_${unique}`;
  const conceptId = `concept_progress_${unique}`;

  const sql = postgres(requireUrl(), {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    prepare: false,
  });

  const tenantSlug = `slug-${unique}`;
  const otherTenantSlug = `slug-other-${unique}`;
  const learnerHandle = `learner-${unique}`;
  const standardCode = `4.NF.A.1-${unique}`;
  const sessionRows = [
    [
      `session_progress_teacher_${unique}`,
      teacherActorId,
      teacherMembershipId,
      tenantId,
    ],
    [
      `session_progress_colleague_${unique}`,
      colleagueActorId,
      colleagueMembershipId,
      tenantId,
    ],
    [
      `session_progress_foreign_${unique}`,
      foreignActorId,
      foreignMembershipId,
      otherTenantId,
    ],
    [
      `session_progress_student_${unique}`,
      studentActorId,
      studentMembershipId,
      tenantId,
    ],
  ] as const;

  try {
    await sql.begin(async (transaction) => {
      await transaction`insert into tenants (id, slug, name, synthetic_data_only, created_at) values (${tenantId}, ${tenantSlug}, ${"Test school"}, true, ${createdAt})`;
      await transaction`insert into tenants (id, slug, name, synthetic_data_only, created_at) values (${otherTenantId}, ${otherTenantSlug}, ${"Other school"}, true, ${createdAt})`;
      for (const [actorId, name] of [
        [teacherActorId, "Teacher"],
        [colleagueActorId, "Colleague"],
        [foreignActorId, "Foreign teacher"],
        [studentActorId, "Student"],
      ] as const) {
        // eslint-disable-next-line no-await-in-loop -- one row per fixture actor, written inside the fixture transaction.
        await transaction`insert into actors (id, display_name, is_active, authorization_revision, created_at) values (${actorId}, ${name}, true, 1, ${createdAt})`;
      }
      await transaction`insert into identities (id, tenant_id, role, display_name, demo_handle, is_active, created_at) values (${learnerId}, ${tenantId}, 'student', ${"Learner"}, ${learnerHandle}, true, ${createdAt})`;
      await transaction`insert into memberships (id, actor_id, tenant_id, role, status, learner_id, revision, created_at) values (${teacherMembershipId}, ${teacherActorId}, ${tenantId}, 'teacher', 'active', null, 1, ${createdAt})`;
      await transaction`insert into memberships (id, actor_id, tenant_id, role, status, learner_id, revision, created_at) values (${colleagueMembershipId}, ${colleagueActorId}, ${tenantId}, 'teacher', 'active', null, 1, ${createdAt})`;
      await transaction`insert into memberships (id, actor_id, tenant_id, role, status, learner_id, revision, created_at) values (${foreignMembershipId}, ${foreignActorId}, ${otherTenantId}, 'teacher', 'active', null, 1, ${createdAt})`;
      await transaction`insert into memberships (id, actor_id, tenant_id, role, status, learner_id, revision, created_at) values (${studentMembershipId}, ${studentActorId}, ${tenantId}, 'student', 'active', ${learnerId}, 1, ${createdAt})`;
      for (const [sessionId, actorId, membershipId, tenant] of sessionRows) {
        const verifierHash = `verifier_${sessionId}`;
        // eslint-disable-next-line no-await-in-loop -- one row per fixture session, written inside the fixture transaction.
        await transaction`insert into identity_sessions (session_id, verifier_hash, actor_id, membership_id, tenant_id, provider_session_id, provider_subject, session_generation, authorization_revision, revision, created_at, last_activity_at, absolute_expires_at) values (${sessionId}, ${verifierHash}, ${actorId}, ${membershipId}, ${tenant}, ${"provider-session"}, ${"provider-subject"}, ${"generation"}, 1, 1, ${createdAt}, ${createdAt}, ${expiresAt})`;
      }
      await transaction`insert into standards (id, tenant_id, code, name, subject, grade_band, created_at) values (${standardId}, ${tenantId}, ${standardCode}, ${"Explain equivalent fractions"}, ${"Math"}, ${"Grade 4"}, ${createdAt})`;
      await transaction`insert into prerequisite_nodes (id, tenant_id, standard_id, label, sequence, created_at) values (${conceptId}, ${tenantId}, ${standardId}, ${"Equal parts"}, 1, ${createdAt})`;
    });
  } finally {
    await sql.end({ timeout: 3 });
  }

  const actor = (
    actorId: string,
    membershipId: string,
    tenant: string,
    role: "teacher" | "student",
    sessionId: string
  ): Actor => {
    return role === "teacher"
      ? {
          actorId: parseActorId(actorId),
          displayName: "Teacher",
          tenantId: parseTenantId(tenant),
          tenantName: "Test school",
          membershipId: parseMembershipId(membershipId),
          sessionId,
          sessionGeneration: "generation",
          authorizationRevision: 1,
          role: "teacher",
          rosterClassIds: [classId],
        }
      : {
          actorId: parseActorId(actorId),
          displayName: "Student",
          tenantId: parseTenantId(tenant),
          tenantName: "Test school",
          membershipId: parseMembershipId(membershipId),
          sessionId,
          sessionGeneration: "generation",
          authorizationRevision: 1,
          role: "student",
          learnerId,
        };
  };

  return {
    tag: unique,
    tenantId,
    otherTenantId,
    standardId,
    conceptId,
    classId,
    learnerId,
    teacher: actor(
      teacherActorId,
      teacherMembershipId,
      tenantId,
      "teacher",
      `session_progress_teacher_${unique}`
    ),
    student: actor(
      studentActorId,
      studentMembershipId,
      tenantId,
      "student",
      `session_progress_student_${unique}`
    ),
    colleague: actor(
      colleagueActorId,
      colleagueMembershipId,
      tenantId,
      "teacher",
      `session_progress_colleague_${unique}`
    ),
    foreignTeacher: actor(
      foreignActorId,
      foreignMembershipId,
      otherTenantId,
      "teacher",
      `session_progress_foreign_${unique}`
    ),
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
      await transaction`delete from assistance_events where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from learner_runs where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from assignments where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from publications where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from lesson_versions where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from lesson_packages where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from curated_references where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from operation_receipts where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from identity_sessions where tenant_id in (${fixture.tenantId}, ${fixture.otherTenantId})`;
      await transaction`delete from memberships where tenant_id in (${fixture.tenantId}, ${fixture.otherTenantId})`;
      await transaction`delete from prerequisite_nodes where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from standards where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from identities where tenant_id = ${fixture.tenantId}`;
      await transaction`delete from tenants where id in (${fixture.tenantId}, ${fixture.otherTenantId})`;
      await transaction`delete from actors where id in (${fixture.teacher.actorId}, ${fixture.student.actorId}, ${fixture.colleague.actorId}, ${fixture.foreignTeacher.actorId})`;
    });
  } finally {
    await sql.end({ timeout: 3 });
  }
};

interface PublishedRun {
  readonly versionId: string;
  readonly runId: string;
}

const publishAndStart = async (
  records: ReturnType<typeof createRecordCommands>,
  fixture: Fixture
): Promise<PublishedRun> => {
  const { tag } = fixture;

  const grounding = await records.storeGrounding(fixture.teacher, {
    operationKey: `store-grounding-${tag}`,
    standardId: fixture.standardId,
    referenceKey: "equivalent-fractions",
    referenceVersion: "2026-10",
    title: "Equivalent fractions",
    attribution: "Synthetic curriculum fixture",
    sourceLocator: "fixture://equivalent-fractions",
    reviewedContent: reviewContent,
  });

  const version = await records.appendVersion(fixture.teacher, {
    operationKey: `append-version-${tag}`,
    package: {
      id: `package_${tag}`,
      title: "Equivalent fractions",
      standardId: fixture.standardId,
    },
    expectedHeadRevision: 0,
    revisionKind: "initial",
    parentVersionId: null,
    predecessorVersionId: null,
    curatedReferenceId: grounding.id,
    generationRequestId: null,
    conceptIds: [fixture.conceptId],
    variantReferences,
    objectiveHash: "a".repeat(64),
    sections,
    approvedCopy,
    provenance,
    changedSectionIds: [],
    ruleVersions,
    validationResult,
    privateAnswerRelationships: privateAnswers,
  });

  const contentHash = createContentHash({
    conceptIds: [fixture.conceptId],
    sections,
    variantReferences,
    approvedCopy,
  });
  const privateAnswerDigest = createPrivateAnswerDigest(privateAnswers);
  const packageHash = createPackageHash({ contentHash, privateAnswerDigest });
  const validationResultHash = createValidationResultHash(validationResult);

  const publication = await records.publish(fixture.teacher, {
    operationKey: `publish-${tag}`,
    versionId: version.id,
    contentHash,
    packageHash,
    privateAnswerDigest,
    validationResultHash,
    ruleVersions,
  });

  const assignment = await records.assign(fixture.teacher, {
    operationKey: `assign-${tag}`,
    publicationId: publication.id,
    learnerId: fixture.learnerId,
    classId: fixture.classId,
  });

  const run = await records.startRun(fixture.student, {
    operationKey: `start-run-${tag}`,
    assignmentId: assignment.id,
    assignedVariantId: "variant_standard",
  });

  return { versionId: version.id, runId: run.id };
};

describe.skipIf(!isRun)("teacher progress database contract", () => {
  let fixture: Fixture;
  let published: PublishedRun;
  let records: ReturnType<typeof createRecordCommands>;
  let service: ReturnType<typeof createLearnerService>;

  const readRun = async (runId: string) => {
    const progress = await records.readTeacherProgress(fixture.teacher);
    return progress.runs.find((run) => run.runId === runId) ?? null;
  };

  beforeAll(async () => {
    records = createRecordCommands(
      createPostgresRecordBackend({ databaseUrl: requireUrl() })
    );
    service = createLearnerService(records);
    fixture = await createFixture("t2");
    published = await publishAndStart(records, fixture);
    await service.submitAttempt(fixture.student, {
      operationKey: `submit-1-${fixture.tag}`,
      runId: published.runId,
      itemId: "item_1",
      expectedRunRevision: 0,
      priorAttemptId: null,
      pairs: [{ sourceId: "item_1", targetId: "target_1" }],
      assistanceState: "none",
      assistanceEventIds: [],
    });
  });

  afterAll(async () => {
    if (fixture) {
      await deleteFixture(fixture);
    }
  });

  // eslint-disable-next-line complexity -- the branches read the nullable row; the replay diff below is the assertion.
  it("replays the stored decision from the persisted attempts (AC2)", async () => {
    const run = await readRun(published.runId);

    expect(run?.decision).not.toBeNull();

    const replay = replayNextActivity({
      runId: published.runId,
      assignedActivityId: run?.assignedVariantId ?? "",
      sectionItemIds: run?.preview?.section.itemIds ?? [],
      attempts: (run?.attempts ?? []).map((attempt) => {
        return {
          itemId: attempt.itemId,
          correctness: attempt.correctness,
          assistanceState: attempt.assistanceState,
          assistanceEventIds: attempt.assistanceEventIds,
        };
      }),
      activities: variantOptions,
    });

    expect(replay).toStrictEqual({
      activityId: run?.decision?.activityId,
      purpose: run?.decision?.purpose,
      reason: run?.decision?.reason,
      ruleVersion: run?.decision?.ruleVersion,
      evidenceHash: run?.decision?.evidenceHash,
    });
    expect(run?.decision?.purpose).toBe("standard");
  });

  it("returns the same record on refresh and a retry appends only (AC1)", async () => {
    const first = await readRun(published.runId);
    const second = await readRun(published.runId);

    expect(first).toStrictEqual(second);

    await service.submitAttempt(fixture.student, {
      operationKey: `submit-2-${fixture.tag}`,
      runId: published.runId,
      itemId: "item_1",
      expectedRunRevision: 1,
      priorAttemptId: null,
      pairs: [{ sourceId: "item_1", targetId: "target_2" }],
      assistanceState: "none",
      assistanceEventIds: [],
    });
    const after = await readRun(published.runId);

    expect(after?.attempts).toHaveLength(2);
    expect(after?.attempts[0]).toStrictEqual(first?.attempts[0]);
    expect(after?.decision).toStrictEqual(first?.decision);
  });

  it("hides a same-tenant colleague's view of another teacher's runs (AC3)", async () => {
    const progress = await records.readTeacherProgress(fixture.colleague);

    expect(progress.runs).toStrictEqual([]);
  });

  it("returns no run from another tenant to a foreign teacher (AC3)", async () => {
    // The foreign teacher is a legitimate actor inside their own tenant, so
    // the boundary is what the read returns: none of the main tenant's runs.
    const progress = await records.readTeacherProgress(fixture.foreignTeacher);

    expect(
      progress.runs.some((run) => run.runId === published.runId)
    ).toBeFalsy();
  });

  it("never serializes an answer key or private relationship (AC3)", async () => {
    const run = await readRun(published.runId);

    const serialized = JSON.stringify(run);

    expect(serialized).not.toContain("correctTargetIds");
    expect(serialized).not.toContain("privateAnswerRelationships");
  });
});
