import { describe, expect, it } from "vitest";

import { createLearnerService } from "@/server/learner/service";
import { replayDecisionDraft } from "@/server/learner/replay";
import { decisionRuleVersion } from "@/server/learner/decision";
import { parseActorId, parseMembershipId } from "@/server/identity/identifiers";
import { isRecordStoreError } from "@/server/records/errors";
import {
  buildLoop,
  createRecordFixture,
  fixtureClassId,
  fixtureCreatedAt,
  fixtureLearnerId,
  fixtureTenantId,
  sectionsForTest,
} from "./records-fixtures";
import type { TeacherProgressRun } from "@/shared/progress-contract";
import type { LearnerAttempt, NextActivity } from "@/server/records/delivery";
import type { TeacherActor } from "@/server/identity/types";

const secondTeacherActorId = parseActorId("actor_teacher_second");
const secondTeacherMembershipId = parseMembershipId(
  "membership_teacher_second"
);

const secondTeacher = (): TeacherActor => {
  return {
    actorId: secondTeacherActorId,
    displayName: "Second teacher",
    tenantId: fixtureTenantId,
    tenantName: "Test school",
    membershipId: secondTeacherMembershipId,
    sessionId: "session_teacher_second",
    sessionGeneration: "generation",
    authorizationRevision: 1,
    role: "teacher",
    rosterClassIds: [fixtureClassId],
  };
};

const requireRow = (
  runs: readonly TeacherProgressRun[]
): TeacherProgressRun => {
  const row = runs[0];
  if (!row) {
    throw new Error("The progress read returned no row.");
  }
  return row;
};

const requireDecision = (row: TeacherProgressRun): NextActivity => {
  if (!row.nextActivity) {
    throw new Error("The progress row carries no stored decision.");
  }
  return row.nextActivity;
};

const submittedPairFor = (correct: boolean) => ({
  sourceId: "item_1",
  targetId: correct ? "target_1" : "target_wrong",
});

/**
A full attempt record rebuilt from the progress row plus the identifiers the row itself carries. The keystone replay consumes exactly what the teacher surface reads — nothing from the fixture besides the run's variant facts.
*/
const attemptFromRow = (
  row: TeacherProgressRun,
  attempt: TeacherProgressRun["attempts"][number]
): LearnerAttempt => {
  return {
    id: attempt.attemptId,
    tenantId: fixtureTenantId,
    schemaVersion: "attempt-v2",
    runId: row.runId,
    publicationId: row.publicationId,
    lessonVersionId: row.screen?.lessonVersionId ?? "",
    itemId: attempt.itemId,
    ordinal: attempt.ordinal,
    priorAttemptId: null,
    selectedPairs: [],
    assistanceState: attempt.assistanceState,
    assistanceEventIds: attempt.assistanceEventIds,
    score: attempt.score,
    correctness: attempt.correctness,
    gradingRuleVersion: "matching-grader-v1",
    createdAt: attempt.createdAt,
  };
};

const setupWithSubmission = async (suffix: string, correct = true) => {
  const fixture = createRecordFixture();
  const loop = await buildLoop(fixture, suffix, "run");
  const service = createLearnerService(fixture.records);
  const submitted = await service.submitAttempt(fixture.student, {
    operationKey: `submit-${suffix}`,
    runId: loop.runId,
    itemId: "item_1",
    expectedRunRevision: 0,
    priorAttemptId: null,
    pairs: [submittedPairFor(correct)],
    assistanceState: "none",
    assistanceEventIds: [],
  });
  return { fixture, loop, service, submitted };
};

describe(createRecordFixture, () => {
  it("lists a run the teacher assigned with its stored decision", async () => {
    const { fixture, loop, submitted } =
      await setupWithSubmission("progress-list");
    const progress = await fixture.records.readTeacherProgress(
      fixture.teacher,
      {}
    );

    expect(progress.runs).toHaveLength(1);

    const row = requireRow(progress.runs);

    expect(row).toMatchObject({
      runId: loop.runId,
      learnerId: fixtureLearnerId,
      stage: "advanced",
      firstResponseStatus: "submitted",
    });
    expect(row.nextActivity).toEqual(submitted.nextActivity);
    expect(row.nextActivity?.ruleVersion).toBe(decisionRuleVersion);
    expect(row.attempts).toHaveLength(1);
  });

  it("exposes the approved screen the run sits on with no answer key", async () => {
    const { fixture } = await setupWithSubmission("progress-screen");
    const progress = await fixture.records.readTeacherProgress(
      fixture.teacher,
      {}
    );
    const { screen } = requireRow(progress.runs);

    expect(screen).not.toBeNull();
    expect(screen?.title).toBe("Worked example");
    expect(screen?.sequence.map((entry) => entry.kind)).toEqual([
      "worked-example",
      "guided-practice",
      "independent-check",
      "follow-up",
    ]);

    const serialized = JSON.stringify(screen);

    expect(serialized).not.toContain("correctTargetIds");
    expect(serialized).not.toContain("privateAnswer");
  });

  it("replays the stored decision from the rows it displays", async () => {
    const { fixture, loop, submitted } = await setupWithSubmission(
      "progress-replay-correct"
    );
    const progress = await fixture.records.readTeacherProgress(
      fixture.teacher,
      {}
    );
    const row = requireRow(progress.runs);
    const stored = requireDecision(row);

    // The variant facts come from the stored version, read through the
    // teacher authoring seam; the attempts come from the progress row.
    const authoring = await fixture.records.readAuthoring(fixture.teacher, {
      kind: "version",
      versionId: loop.versionId,
    });
    const variants = authoring.versions[0]?.variantReferences ?? [];

    const replayed = replayDecisionDraft({
      runId: row.runId,
      assignedActivityId: "variant_standard",
      activities: variants.map((variant) => ({
        activityId: variant.variantId,
        kind: variant.kind,
      })),
      sectionItemIds: sectionsForTest[0].itemIds,
      attempts: row.attempts.map((attempt) => attemptFromRow(row, attempt)),
      derivedFromAttemptId: stored.derivedFromAttemptId,
    });

    // The replay re-decides; the record layer alone stamps the deriving
    // attempt, so the diff against the stored row is exactly that field.
    const { derivedFromAttemptId, ...storedDraft } = stored;

    expect(replayed).toEqual(storedDraft);
    expect(derivedFromAttemptId).toBe(
      row.attempts.find((attempt) => attempt.attemptId === derivedFromAttemptId)
        ?.attemptId ?? null
    );
    expect(replayed).toEqual({
      ...submitted.nextActivity,
      derivedFromAttemptId: undefined,
    });
  });

  it("replays a scaffold routing for an incorrect first response", async () => {
    const { fixture } = await setupWithSubmission(
      "progress-replay-scaffold",
      false
    );
    const progress = await fixture.records.readTeacherProgress(
      fixture.teacher,
      {}
    );
    const stored = requireDecision(requireRow(progress.runs));

    expect(stored).toMatchObject({
      purpose: "scaffold",
      reason: "The learner needs another supported example.",
      activityId: "variant_scaffold",
    });
  });

  it("shows a completed submission after a re-read without moving history", async () => {
    const { fixture, loop, service } =
      await setupWithSubmission("progress-refresh");
    const before = await fixture.records.readTeacherProgress(
      fixture.teacher,
      {}
    );
    const prior = requireRow(before.runs).attempts[0];

    await service.submitAttempt(fixture.student, {
      operationKey: `retry-${loop.runId}`,
      runId: loop.runId,
      itemId: "item_1",
      expectedRunRevision: 1,
      priorAttemptId: prior?.attemptId ?? null,
      pairs: [submittedPairFor(false)],
      assistanceState: "none",
      assistanceEventIds: [],
    });

    const after = await fixture.records.readTeacherProgress(
      fixture.teacher,
      {}
    );
    const row = requireRow(after.runs);

    expect(row.attempts).toHaveLength(2);
    expect(row.nextActivity).toEqual(requireRow(before.runs).nextActivity);
    expect(row.attempts[0]).toEqual(prior);
  });

  it("orders runs newest activity first", async () => {
    const fixture = createRecordFixture();
    const first = await buildLoop(fixture, "progress-order-a", "assignment");
    const second = await buildLoop(fixture, "progress-order-b", "assignment");
    await fixture.records.startRun(fixture.student, {
      operationKey: `start-run-a-${first.assignmentId}`,
      assignmentId: first.assignmentId,
      assignedVariantId: "variant_standard",
    });
    await fixture.records.startRun(fixture.student, {
      operationKey: `start-run-b-${second.assignmentId}`,
      assignmentId: second.assignmentId,
      assignedVariantId: "variant_standard",
    });

    const { runs } = await fixture.records.readTeacherProgress(
      fixture.teacher,
      {}
    );

    expect(runs).toHaveLength(2);

    const stamps = runs.map((run) => run.updatedAt);

    expect([...stamps].sort().reverse()).toEqual(stamps);
  });

  it("returns nothing for a teacher who assigned no lesson", async () => {
    const fixture = createRecordFixture();
    const progress = await fixture.records.readTeacherProgress(
      fixture.teacher,
      {}
    );

    expect(progress.runs).toEqual([]);
  });

  it("hides another teacher's runs inside the same tenant", async () => {
    const { fixture } = await setupWithSubmission("progress-second-teacher");
    fixture.backend.seed("actors", [
      {
        id: secondTeacherActorId,
        display_name: "Second teacher",
        is_active: true,
        authorization_revision: 1,
        created_at: fixtureCreatedAt,
      },
    ]);
    fixture.backend.seed("memberships", [
      {
        id: secondTeacherMembershipId,
        actor_id: secondTeacherActorId,
        tenant_id: fixtureTenantId,
        role: "teacher",
        status: "active",
        learner_id: null,
        revision: 1,
        created_at: fixtureCreatedAt,
      },
    ]);
    fixture.backend.seed("identity_sessions", [
      {
        session_id: "session_teacher_second",
        actor_id: secondTeacherActorId,
        membership_id: secondTeacherMembershipId,
        tenant_id: fixtureTenantId,
        authorization_revision: 1,
        revision: 1,
        revoked_at: null,
        absolute_expires_at: "2099-01-01T00:00:00.000Z",
        created_at: fixtureCreatedAt,
      },
    ]);

    const outsider = await fixture.records.readTeacherProgress(
      secondTeacher(),
      {}
    );

    expect(outsider.runs).toEqual([]);
  });

  it("denies a foreign tenant the same way", async () => {
    const { fixture } = await setupWithSubmission("progress-foreign");
    try {
      await fixture.records.readTeacherProgress(fixture.foreignTeacher, {});

      expect.unreachable("The foreign teacher read should not resolve.");
    } catch (error) {
      expect(isRecordStoreError(error) && error.code).toBe("FORBIDDEN");
    }
  });

  it("reads one run by id and denies an unassigned run the same way", async () => {
    const { fixture, loop } = await setupWithSubmission("progress-by-id");
    const single = await fixture.records.readTeacherProgress(fixture.teacher, {
      runId: loop.runId,
    });

    expect(single.runs).toHaveLength(1);
    expect(single.runs[0]?.runId).toBe(loop.runId);

    try {
      await fixture.records.readTeacherProgress(fixture.teacher, {
        runId: "run_missing",
      });

      expect.unreachable("The unknown run read should not resolve.");
    } catch (error) {
      expect(isRecordStoreError(error) && error.code).toBe("FORBIDDEN");
    }
  });

  it("lists a run with missing approved content as a designed gap", async () => {
    const fixture = createRecordFixture();
    const loop = await buildLoop(fixture, "progress-ghost", "assignment");
    fixture.backend.seed("learner_runs", [
      {
        id: "run_ghost",
        tenant_id: fixtureTenantId,
        schema_version: "learner-run-v1",
        assignment_id: loop.assignmentId,
        learner_id: fixtureLearnerId,
        publication_id: "publication_ghost",
        assigned_variant_id: "variant_standard",
        stage: "active",
        first_response_status: "pending",
        revision: 0,
        next_activity: null,
        created_at: fixtureCreatedAt,
        updated_at: fixtureCreatedAt,
      },
    ]);

    const { runs } = await fixture.records.readTeacherProgress(
      fixture.teacher,
      {}
    );

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      runId: "run_ghost",
      screen: null,
      nextActivity: null,
      attempts: [],
    });
  });
});
