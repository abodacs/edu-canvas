import { describe, expect, it } from "vitest";

import {
  learnerAttemptResponseSchema,
  learnerRunResponseSchema,
} from "./learner-contract";

const section = {
  id: "section-standard",
  kind: "worked-example",
  title: "Equivalent fractions",
  body: "Two fractions name the same part of a whole.",
  itemIds: ["item-half"],
  items: [{ id: "item-half", label: "1/2", role: "source" }],
} as const;

const runResponse = {
  runId: "run_fraction_0001",
  runRevision: 1,
  lesson: {
    publicationId: "publication_fraction_0001",
    lessonVersionId: "version_fraction_0001",
    assignedVariantId: "variant_standard",
    sections: [section, section, section, section],
    stage: "assigned",
    firstResponseStatus: "pending",
    nextActivity: null,
  },
  evidence: {
    runId: "run_fraction_0001",
    attempts: [],
    assistanceEvents: [],
  },
} as const;

describe("learner boundary contract", () => {
  it("accepts the run response the server builds", () => {
    expect(learnerRunResponseSchema.parse(runResponse)).toStrictEqual(
      runResponse
    );
  });

  it("rejects a section whose field was renamed", () => {
    const { itemIds, ...rest } = section;
    const drifted = {
      ...runResponse,
      lesson: {
        ...runResponse.lesson,
        sections: [{ ...rest, itemIDs: itemIds }],
      },
    };

    expect(learnerRunResponseSchema.safeParse(drifted).success).toBeFalsy();
  });

  it("rejects a section that gains a field the contract does not publish", () => {
    const drifted = {
      ...runResponse,
      lesson: {
        ...runResponse.lesson,
        sections: [{ ...section, answerKey: ["1/2:2/4"] }],
      },
    };

    expect(learnerRunResponseSchema.safeParse(drifted).success).toBeFalsy();
  });

  it("rejects an attempt response that carries a submitted pair list", () => {
    const attempt = {
      attemptId: "attempt_fraction_0001",
      gradingRuleVersion: "matching-grader-v1",
      score: 100,
      correctness: "correct",
      requiredMatches: 1,
      correctMatches: 1,
      incorrectMatches: 0,
      missingMatches: 0,
    };

    expect(
      learnerAttemptResponseSchema.safeParse(attempt).success
    ).toBeTruthy();
    expect(
      learnerAttemptResponseSchema.safeParse({
        ...attempt,
        pairs: [{ sourceId: "item-half", targetId: "item-quarter" }],
      }).success
    ).toBeFalsy();
  });
});
