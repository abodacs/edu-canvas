import { describe, expect, it } from "vitest";

import { decideReceipt, withoutOperationKey } from "./receipt";

const hash = "a".repeat(64);
const otherHash = "b".repeat(64);

describe(withoutOperationKey, () => {
  it("drops the key and keeps the work", () => {
    expect(
      withoutOperationKey({ operationKey: "publish-1", learnerId: "learner_1" })
    ).toStrictEqual({ learnerId: "learner_1" });
  });

  it("leaves a payload without a key unchanged", () => {
    expect(withoutOperationKey({ learnerId: "learner_1" })).toStrictEqual({
      learnerId: "learner_1",
    });
  });
});

describe(decideReceipt, () => {
  it("runs when no receipt is stored", () => {
    expect(decideReceipt(undefined, hash)).toStrictEqual({ outcome: "fresh" });
  });

  it("replays the stored identifiers for the same input", () => {
    expect(
      decideReceipt({ inputHash: hash, resultIds: ["version-1", "run-1"] }, hash)
    ).toStrictEqual({
      outcome: "replay",
      resultIds: ["version-1", "run-1"],
    });
  });

  it("refuses the same key for different work", () => {
    expect(
      decideReceipt({ inputHash: otherHash, resultIds: ["version-1"] }, hash)
    ).toStrictEqual({ outcome: "conflict" });
  });
});
