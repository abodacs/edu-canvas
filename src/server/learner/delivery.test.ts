import { describe, expect, it } from "vitest";

import {
  learnerAttemptInputSchema,
  learnerRunInputSchema,
} from "./delivery.server";

const body = {
  operationKey: "submit-attempt-key-1",
  runId: "run_1",
  itemId: "item_1",
  expectedRunRevision: 0,
  priorAttemptId: null,
  pairs: [{ sourceId: "item_1", targetId: "target_1" }],
  assistanceState: "none",
  assistanceEventIds: [],
};

const parseAttempt = (value: unknown) =>
  learnerAttemptInputSchema.safeParse(value);

describe(parseAttempt, () => {
  it("accepts a submission that carries selections only", () => {
    expect(parseAttempt(body).success).toBeTruthy();
  });

  it("rejects a body that carries a score", () => {
    const parsed = parseAttempt({ ...body, score: 100 });

    expect(parsed.success).toBeFalsy();
  });

  it("rejects a pair that carries extra fields", () => {
    const parsed = parseAttempt({
      ...body,
      pairs: [{ correct: true, sourceId: "item_1", targetId: "target_1" }],
    });

    expect(parsed.success).toBeFalsy();
  });

  it("rejects an empty selection", () => {
    expect(parseAttempt({ ...body, pairs: [] }).success).toBeFalsy();
  });
});

const parseRun = (value: unknown) => learnerRunInputSchema.safeParse(value);

describe(parseRun, () => {
  const run = {
    operationKey: "start-run-key-1",
    assignmentId: "assignment_1",
    assignedVariantId: "variant-a",
  };

  it("accepts an assignment and a variant", () => {
    expect(parseRun(run).success).toBeTruthy();
  });

  it("rejects a body that carries anything else", () => {
    expect(parseRun({ ...run, learnerId: "learner_1" }).success).toBeFalsy();
  });
});
