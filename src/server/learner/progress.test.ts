import { describe, expect, it } from "vitest";

import {
  buildLoop,
  createRecordFixture,
  fixtureLearnerId,
  fixtureTenantId,
} from "@/server/persistence/records-fixtures";
import { parseActorId, parseMembershipId } from "../identity/identifiers";
import { createLearnerService } from "./service";
import { decisionReasonCopy, replayNextActivity } from "./decision";
import type { RecordFixture } from "@/server/persistence/records-fixtures";
import type { ProgressRun } from "@/shared/progress-contract";
import type { ActivityOption } from "./decision";
import type { SubmitAttemptInput } from "./service";

/**
 * #8 teacher progress read model over the seeded record backend.
 *
 * The replay suite is the core proof for issue #8 AC2: it recomputes the submit-time decision pass from the run's persisted attempts and diffs the result against the stored next_activity row. The boundary suite proves AC3: a read reaches only the calling teacher's own assignments inside the calling tenant, and never carries an answer key.
 */

const variantOptions: readonly ActivityOption[] = [
  { activityId: "variant_standard", kind: "standard" },
  { activityId: "variant_standard_b", kind: "standard" },
  { activityId: "variant_scaffold", kind: "scaffold" },
];

const setup = async (suffix: string) => {
  const fixture = createRecordFixture();
  const loop = await buildLoop(fixture, suffix, "run");
  const service = createLearnerService(fixture.records);
  return { fixture, loop, service };
};

const submitAttempt = (
  fixture: RecordFixture,
  runId: string,
  overrides: Partial<SubmitAttemptInput> = {}
) => {
  return createLearnerService(fixture.records).submitAttempt(fixture.student, {
    operationKey: `submit-${runId}-${overrides.expectedRunRevision ?? 0}`,
    runId,
    itemId: "item_1",
    expectedRunRevision: 0,
    priorAttemptId: null,
    pairs: [{ sourceId: "item_1", targetId: "target_1" }],
    assistanceState: "none",
    assistanceEventIds: [],
    ...overrides,
  });
};

const readRun = async (
  fixture: RecordFixture,
  runId: string
): Promise<ProgressRun | null> => {
  const progress = await fixture.records.readTeacherProgress(fixture.teacher);
  return progress.runs.find((run) => run.runId === runId) ?? null;
};

const replayFor = (run: ProgressRun) => {
  return replayNextActivity({
    runId: run.runId,
    assignedActivityId: run.assignedVariantId,
    sectionItemIds: run.preview?.section.itemIds ?? [],
    attempts: run.attempts.map((attempt) => {
      return {
        itemId: attempt.itemId,
        correctness: attempt.correctness,
        assistanceState: attempt.assistanceState,
        assistanceEventIds: attempt.assistanceEventIds,
      };
    }),
    activities: variantOptions,
  });
};

describe(replayNextActivity, () => {
  it("returns no decision when no attempt covers the assigned section", () => {
    expect(
      replayNextActivity({
        runId: "run_replay_empty",
        assignedActivityId: "variant_standard",
        sectionItemIds: ["item_1"],
        attempts: [],
        activities: variantOptions,
      })
    ).toBeNull();
  });
});

describe("stored decision replay (issue #8 AC2)", () => {
  it("a fresh pass over the persisted attempts equals the stored decision", async () => {
    const { fixture, loop } = await setup("progress-correct");
    const submitted = await submitAttempt(fixture, loop.runId);

    const run = await readRun(fixture, loop.runId);

    expect(run).not.toBeNull();

    const stored = run?.decision ?? null;

    expect(stored).toMatchObject({
      activityId: submitted.nextActivity?.activityId,
      purpose: "standard",
      derivedFromAttemptId: submitted.attemptId,
    });

    const replay = replayFor(run as ProgressRun);

    expect(replay).not.toBeNull();
    expect(replay).toStrictEqual({
      activityId: stored?.activityId,
      purpose: stored?.purpose,
      reason: stored?.reason,
      ruleVersion: stored?.ruleVersion,
      evidenceHash: stored?.evidenceHash,
    });
  });

  it("an incorrect first response replays to the scaffold routing", async () => {
    const { fixture, loop } = await setup("progress-incorrect");
    await submitAttempt(fixture, loop.runId, {
      pairs: [{ sourceId: "item_1", targetId: "target_2" }],
    });

    const run = await readRun(fixture, loop.runId);
    const stored = run?.decision ?? null;

    expect(stored?.purpose).toBe("scaffold");

    expect(replayFor(run as ProgressRun)).toStrictEqual({
      activityId: stored?.activityId,
      purpose: stored?.purpose,
      reason: stored?.reason,
      ruleVersion: stored?.ruleVersion,
      evidenceHash: stored?.evidenceHash,
    });
  });

  it("a hinted first response replays to the scaffold routing", async () => {
    const { fixture, loop } = await setup("progress-hinted");
    const hint = await fixture.records.recordHint(fixture.student, {
      operationKey: "record-hint-progress",
      runId: loop.runId,
      itemId: "item_1",
      expectedRunRevision: 0,
    });
    await submitAttempt(fixture, loop.runId, {
      expectedRunRevision: 1,
      assistanceState: "hinted",
      assistanceEventIds: [hint.id],
    });

    const run = await readRun(fixture, loop.runId);
    const stored = run?.decision ?? null;

    expect(stored?.purpose).toBe("scaffold");

    expect(replayFor(run as ProgressRun)).toStrictEqual({
      activityId: stored?.activityId,
      purpose: stored?.purpose,
      reason: stored?.reason,
      ruleVersion: stored?.ruleVersion,
      evidenceHash: stored?.evidenceHash,
    });
  });
});

describe("decision reason vocabulary (issue #8 AC5)", () => {
  it("the stored reason is the rule copy for the routing it made", async () => {
    const cases = [
      {
        name: "scaffold",
        submit: { pairs: [{ sourceId: "item_1", targetId: "target_2" }] },
        expectedPurpose: "scaffold",
      },
      {
        name: "practice",
        submit: {},
        expectedPurpose: "standard",
      },
    ] as const;

    for (const decisionCase of cases) {
      // eslint-disable-next-line no-await-in-loop -- each case needs its own recorded run.
      const { fixture, loop } = await setup(
        `progress-reason-${decisionCase.name}`
      );
      // eslint-disable-next-line no-await-in-loop -- see above.
      await submitAttempt(fixture, loop.runId, { ...decisionCase.submit });
      // eslint-disable-next-line no-await-in-loop -- see above.
      const run = await readRun(fixture, loop.runId);

      expect(run?.decision?.purpose).toBe(decisionCase.expectedPurpose);
      expect(run?.decision?.reason).toBe(
        decisionReasonCopy[decisionCase.expectedPurpose]
      );
      expect(run?.decision?.reason.length).toBeGreaterThan(0);
    }
  });

  it("the missing-evidence pause names the missing evidence", async () => {
    const { fixture, loop } = await setup("progress-pause-reason");
    await fixture.records.recordHint(fixture.student, {
      operationKey: "record-hint-pause",
      runId: loop.runId,
      itemId: "item_1",
      expectedRunRevision: 0,
    });

    const run = await readRun(fixture, loop.runId);

    expect(run?.decision).toBeNull();
    expect(run?.attempts).toHaveLength(0);
    expect(decisionReasonCopy.pause).toContain("evidence");
  });
});

describe("refresh and history immutability (issue #8 AC1)", () => {
  it("a completed submission appears on the next read and never changes", async () => {
    const { fixture, loop } = await setup("progress-refresh");
    const submitted = await submitAttempt(fixture, loop.runId);

    const first = await readRun(fixture, loop.runId);
    const second = await readRun(fixture, loop.runId);

    expect(first).toStrictEqual(second);
    expect(second?.attempts.map((attempt) => attempt.attemptId)).toStrictEqual([
      submitted.attemptId,
    ]);
    expect(second?.decision).toStrictEqual(first?.decision);
  });

  it("a retry appends evidence and keeps the first response and reason", async () => {
    const { fixture, loop } = await setup("progress-retry");
    await submitAttempt(fixture, loop.runId);
    const before = await readRun(fixture, loop.runId);
    await submitAttempt(fixture, loop.runId, {
      expectedRunRevision: 1,
      operationKey: `submit-retry-${loop.runId}`,
      pairs: [{ sourceId: "item_1", targetId: "target_2" }],
    });
    const after = await readRun(fixture, loop.runId);

    expect(after?.attempts).toHaveLength(2);
    expect(after?.attempts[0]).toStrictEqual(before?.attempts[0]);
    expect(after?.decision).toStrictEqual(before?.decision);
  });
});

describe("progress read boundaries (issue #8 AC3)", () => {
  it("refuses a teacher from another tenant", async () => {
    const { fixture, loop } = await setup("progress-foreign");
    await submitAttempt(fixture, loop.runId);

    await expect(
      fixture.records.readTeacherProgress(fixture.foreignTeacher)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a student", async () => {
    const { fixture, loop } = await setup("progress-student");
    await submitAttempt(fixture, loop.runId);

    await expect(
      fixture.records.readTeacherProgress(fixture.student)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("hides another teacher's assignments inside the same tenant", async () => {
    const { fixture, loop } = await setup("progress-colleague");
    await submitAttempt(fixture, loop.runId);
    fixture.backend.seed("actors", [
      {
        id: "actor_teacher_colleague",
        display_name: "Colleague",
        is_active: true,
        authorization_revision: 1,
        created_at: "2026-10-28T00:00:00.000Z",
      },
    ]);
    fixture.backend.seed("memberships", [
      {
        id: "membership_teacher_colleague",
        actor_id: "actor_teacher_colleague",
        tenant_id: fixtureTenantId,
        role: "teacher",
        status: "active",
        learner_id: null,
        revision: 1,
        created_at: "2026-10-28T00:00:00.000Z",
      },
    ]);
    fixture.backend.seed("identity_sessions", [
      {
        session_id: "session_teacher_colleague",
        actor_id: "actor_teacher_colleague",
        membership_id: "membership_teacher_colleague",
        tenant_id: fixtureTenantId,
        authorization_revision: 1,
        revision: 1,
        revoked_at: null,
        absolute_expires_at: "2099-01-01T00:00:00.000Z",
        created_at: "2026-10-28T00:00:00.000Z",
      },
    ]);
    const colleague = {
      ...fixture.teacher,
      actorId: parseActorId("actor_teacher_colleague"),
      membershipId: parseMembershipId("membership_teacher_colleague"),
      sessionId: "session_teacher_colleague",
    };

    const progress = await fixture.records.readTeacherProgress(colleague);

    expect(progress.runs).toStrictEqual([]);
  });

  it("returns no runs for a teacher without assignments", async () => {
    const fixture = createRecordFixture();

    const progress = await fixture.records.readTeacherProgress(fixture.teacher);

    expect(progress.fetchedAt.length).toBeGreaterThan(0);
    expect(progress.runs).toStrictEqual([]);
  });

  it("carries the assigned learner and no unrelated learner", async () => {
    const { fixture, loop } = await setup("progress-learner");
    await submitAttempt(fixture, loop.runId);

    const progress = await fixture.records.readTeacherProgress(fixture.teacher);

    expect(progress.runs).toHaveLength(1);
    expect(progress.runs[0]?.learnerId).toBe(fixtureLearnerId);
    expect(progress.runs[0]?.learnerDisplayName).toBe("Lily Parker");
  });

  it("never carries an answer key or private relationship", async () => {
    const { fixture, loop } = await setup("progress-private");
    await submitAttempt(fixture, loop.runId);

    const progress = await fixture.records.readTeacherProgress(fixture.teacher);
    const serialized = JSON.stringify(progress);

    expect(serialized).not.toContain("correctTargetIds");
    expect(serialized).not.toContain("privateAnswerRelationships");
    expect(serialized).not.toContain("objectiveHash");
  });
});

describe("approved screen preview (issue #8 AC4)", () => {
  it("carries the assigned approved section read-only", async () => {
    const { fixture, loop } = await setup("progress-preview");
    await submitAttempt(fixture, loop.runId);

    const run = await readRun(fixture, loop.runId);

    expect(run?.preview).toMatchObject({
      lessonVersionId: loop.versionId,
      variantId: "variant_standard",
      columns: { sourceLabel: "Fractions", targetLabel: "Equivalents" },
    });
    expect(run?.preview?.section.title).toBe("Worked example");
    expect(run?.preview?.section.itemIds).toContain("item_1");

    const serialized = JSON.stringify(run?.preview);

    expect(serialized).not.toContain("correctTargetIds");
  });
});
