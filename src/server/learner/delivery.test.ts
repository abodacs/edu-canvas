import { describe, expect, it } from "vitest";

import { learnerAttemptInputSchema } from "./delivery.server";

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

describe(learnerAttemptInputSchema, () => {
  it("accepts a submission that carries selections only", () => {
    expect(learnerAttemptInputSchema.safeParse(body).success).toBeTruthy();
  });

  it("rejects a body that carries a score", () => {
    const parsed = learnerAttemptInputSchema.safeParse({ ...body, score: 100 });

    expect(parsed.success).toBeFalsy();
  });

  it("rejects a pair that carries extra fields", () => {
    const parsed = learnerAttemptInputSchema.safeParse({
      ...body,
      pairs: [{ correct: true, sourceId: "item_1", targetId: "target_1" }],
    });

    expect(parsed.success).toBeFalsy();
  });

  it("rejects an empty selection", () => {
    expect(
      learnerAttemptInputSchema.safeParse({ ...body, pairs: [] }).success
    ).toBeFalsy();
  });
});
