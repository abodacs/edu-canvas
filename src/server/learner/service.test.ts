import { describe, expect, it } from "vitest";

import {
  buildLoop,
  createRecordFixture,
} from "@/server/persistence/records-fixtures";
import { createLearnerService } from "./service";
import type { SubmitAttemptInput } from "./service";

const setup = async (suffix: string) => {
  const fixture = createRecordFixture();
  const loop = await buildLoop(fixture, suffix, "run");
  const service = createLearnerService(fixture.records);
  return { fixture, loop, service };
};

const inputFor = (
  runId: string,
  overrides: Partial<SubmitAttemptInput> = {}
): SubmitAttemptInput => {
  return {
    operationKey: "submit-attempt-key-1",
    runId,
    itemId: "item_1",
    expectedRunRevision: 0,
    priorAttemptId: null,
    pairs: [{ sourceId: "item_1", targetId: "target_1" }],
    assistanceState: "none",
    assistanceEventIds: [],
    ...overrides,
  };
};

describe(createLearnerService, () => {
  it("grades a correct submission on the server and records it", async () => {
    const { fixture, loop, service } = await setup("service-correct");
    const submitted = await service.submitAttempt(
      fixture.student,
      inputFor(loop.runId)
    );

    expect(submitted).toMatchObject({
      score: 100,
      correctness: "correct",
      requiredMatches: 1,
      correctMatches: 1,
      incorrectMatches: 0,
      gradingRuleVersion: "matching-grader-v1",
    });
    expect(submitted.attemptId.length).toBeGreaterThan(0);
  });

  it("ignores a caller-supplied score", async () => {
    const { fixture, loop, service } = await setup("service-tamper");
    const tampered = inputFor(loop.runId) as SubmitAttemptInput & {
      score: number;
    };
    tampered.score = 0;
    const submitted = await service.submitAttempt(fixture.student, tampered);

    expect(submitted.score).toBe(100);
  });

  it("scores a wrong target as incorrect and keeps the attempt", async () => {
    const { fixture, loop, service } = await setup("service-wrong-target");
    const submitted = await service.submitAttempt(
      fixture.student,
      inputFor(loop.runId, {
        pairs: [{ sourceId: "item_1", targetId: "target_2" }],
      })
    );

    expect(submitted).toMatchObject({
      score: 0,
      correctness: "incorrect",
      incorrectMatches: 1,
    });
  });

  it("replays the same operation key to the same attempt", async () => {
    const { fixture, loop, service } = await setup("service-replay");
    const input = inputFor(loop.runId);
    const first = await service.submitAttempt(fixture.student, input);
    const replay = await service.submitAttempt(fixture.student, input);

    expect(replay.attemptId).toBe(first.attemptId);
  });

  it("refuses a stale run revision and writes nothing", async () => {
    const { fixture, loop, service } = await setup("service-stale");

    await expect(
      service.submitAttempt(
        fixture.student,
        inputFor(loop.runId, { expectedRunRevision: 7 })
      )
    ).rejects.toMatchObject({ code: "STALE_VERSION" });

    const read = await fixture.records.readLesson(fixture.student, {
      runId: loop.runId,
    });

    expect(read.evidence.attempts).toHaveLength(0);
  });

  it("refuses a fourth attempt on one item but replays a duplicate", async () => {
    const { fixture, loop, service } = await setup("service-limit");
    for (let index = 0; index < 3; index += 1) {
      // eslint-disable-next-line no-await-in-loop -- each attempt advances the run revision the next one needs.
      await service.submitAttempt(
        fixture.student,
        inputFor(loop.runId, {
          expectedRunRevision: index,
          operationKey: `submit-attempt-key-${index}`,
        })
      );
    }

    await expect(
      service.submitAttempt(
        fixture.student,
        inputFor(loop.runId, {
          expectedRunRevision: 3,
          operationKey: "submit-attempt-key-over",
        })
      )
    ).rejects.toMatchObject({ code: "ATTEMPT_LIMIT_REACHED" });

    const replay = await service.submitAttempt(
      fixture.student,
      inputFor(loop.runId, {
        expectedRunRevision: 0,
        operationKey: "submit-attempt-key-0",
      })
    );

    expect(replay.attemptId.length).toBeGreaterThan(0);
  });

  it("refuses a learner from another tenant", async () => {
    const { fixture, loop, service } = await setup("service-foreign");

    await expect(
      service.submitAttempt(fixture.foreignStudent, inputFor(loop.runId))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
