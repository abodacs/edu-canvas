import { describe, expect, it } from "vitest";

import { learnerAttemptSchema } from "@/server/records/delivery";

import { decisionRuleVersion } from "./decision";
import {
  buildDecisionDraft,
  firstStoredResponse,
  replayDecisionDraft,
  wasAssisted,
} from "./replay";
import type { LearnerAttempt } from "@/server/records/delivery";
import type { DecisionActivityOption } from "./replay";

const runId = "run_replay";
const assignedActivityId = "variant_standard";
const sectionItemIds = ["item_1"];
const activities: readonly DecisionActivityOption[] = [
  { activityId: "variant_standard", kind: "standard" },
  { activityId: "variant_standard_b", kind: "standard" },
  { activityId: "variant_scaffold", kind: "scaffold" },
];

const attempt = (overrides: Partial<LearnerAttempt> = {}): LearnerAttempt => {
  return learnerAttemptSchema.parse({
    id: "attempt_1",
    tenantId: "tenant_replay",
    schemaVersion: "attempt-v2",
    runId,
    publicationId: "publication_replay",
    lessonVersionId: "version_replay",
    itemId: "item_1",
    ordinal: 1,
    priorAttemptId: null,
    selectedPairs: [{ sourceId: "item_1", targetId: "target_1" }],
    assistanceState: "none",
    assistanceEventIds: [],
    score: 100,
    correctness: "correct",
    gradingRuleVersion: "matching-grader-v1",
    createdAt: "2026-11-03T00:00:00.000Z",
    ...overrides,
  });
};

const draftInput = (
  first: Parameters<typeof buildDecisionDraft>[0]["first"]
) => {
  return {
    runId,
    assignedActivityId,
    activities,
    first,
  };
};

const replayInput = (
  attempts: readonly LearnerAttempt[],
  derivedFromAttemptId: string | null
) => {
  return {
    runId,
    assignedActivityId,
    activities,
    sectionItemIds,
    attempts,
    derivedFromAttemptId,
  };
};

describe(wasAssisted, () => {
  it("reads a hinted state as assisted", () => {
    expect(
      wasAssisted({ assistanceState: "hinted", assistanceEventIds: [] })
    ).toBeTruthy();
  });

  it("reads recorded events as assisted even when the state is none", () => {
    expect(
      wasAssisted({ assistanceState: "none", assistanceEventIds: ["event_1"] })
    ).toBeTruthy();
  });

  it("reads an unassisted none submission as independent", () => {
    expect(
      wasAssisted({ assistanceState: "none", assistanceEventIds: [] })
    ).toBeFalsy();
  });
});

describe(firstStoredResponse, () => {
  it("takes the first stored response in caller order", () => {
    const attempts = [
      attempt({ id: "attempt_first", ordinal: 1, correctness: "correct" }),
      attempt({ id: "attempt_late", ordinal: 2, correctness: "incorrect" }),
    ];

    expect(firstStoredResponse(attempts, sectionItemIds)).toMatchObject({
      itemId: "item_1",
      correctness: "correct",
    });
  });

  it("ignores attempts on other sections", () => {
    const attempts = [
      attempt({ id: "attempt_other", itemId: "item_2", ordinal: 1 }),
    ];

    expect(firstStoredResponse(attempts, sectionItemIds)).toBeNull();
  });
});

describe(buildDecisionDraft, () => {
  it("stamps the checked-in rule version on every draft", () => {
    const draft = buildDecisionDraft(
      draftInput({
        itemId: "item_1",
        correctness: "correct",
        assisted: false,
        assistanceEventIds: [],
      })
    );

    expect(draft.ruleVersion).toBe(decisionRuleVersion);
  });

  it("derives the evidence hash from the first response only", () => {
    const first = {
      itemId: "item_1",
      correctness: "correct" as const,
      assisted: false,
      assistanceEventIds: [] as readonly string[],
    };
    const draft = buildDecisionDraft(draftInput(first));
    const retryFirst = { ...first, correctness: "incorrect" as const };

    expect(buildDecisionDraft(draftInput(first)).evidenceHash).toBe(
      draft.evidenceHash
    );
    expect(buildDecisionDraft(draftInput(retryFirst)).evidenceHash).not.toBe(
      draft.evidenceHash
    );
  });
});

describe(replayDecisionDraft, () => {
  it("stands in the derived attempt when nothing sat on the section yet", () => {
    const derived = attempt({ id: "attempt_write", itemId: "item_2" });
    const draft = replayDecisionDraft(replayInput([derived], derived.id));

    expect(draft).toEqual(
      buildDecisionDraft(
        draftInput({
          itemId: "item_2",
          correctness: "correct",
          assisted: false,
          assistanceEventIds: [],
        })
      )
    );
  });

  it("replays the scaffold row for an incorrect first response", () => {
    const derived = attempt({ correctness: "incorrect", score: 0 });
    const draft = replayDecisionDraft(replayInput([derived], derived.id));

    expect(draft).toMatchObject({
      activityId: "variant_scaffold",
      purpose: "scaffold",
      reason: "The learner needs another supported example.",
    });
  });

  it("replays the scaffold row for an assisted correct response", () => {
    const derived = attempt({
      assistanceState: "hinted",
      assistanceEventIds: ["event_hint_1"],
    });
    const draft = replayDecisionDraft(replayInput([derived], derived.id));

    expect(draft).toMatchObject({ purpose: "scaffold" });
  });

  it("replays the standard row when guided evidence is missing", () => {
    const derived = attempt();
    const draft = replayDecisionDraft(replayInput([derived], derived.id));

    expect(draft).toMatchObject({
      activityId: "variant_standard_b",
      purpose: "standard",
      reason: "The learner needs more independent practice.",
    });
  });

  it("replays the write-time decision even after later attempts land", () => {
    const derived = attempt({ id: "attempt_write", correctness: "incorrect" });
    const later = attempt({
      id: "attempt_retry",
      ordinal: 2,
      correctness: "correct",
      priorAttemptId: derived.id,
    });
    const replayed = replayDecisionDraft(
      replayInput([derived, later], derived.id)
    );
    const asOfWrite = replayDecisionDraft(replayInput([derived], derived.id));

    expect(replayed).toEqual(asOfWrite);
    expect(replayed).toMatchObject({ purpose: "scaffold" });
  });

  it("matches the write-path draft for the same evidence", () => {
    const derived = attempt();
    const storedFirst = firstStoredResponse([derived], sectionItemIds);
    const fromWrite = buildDecisionDraft(
      draftInput(
        storedFirst ?? {
          itemId: "item_1",
          correctness: "correct",
          assisted: false,
          assistanceEventIds: [],
        }
      )
    );

    expect(replayDecisionDraft(replayInput([derived], derived.id))).toEqual(
      fromWrite
    );
  });

  it("returns null when no stored evidence can stand in", () => {
    expect(replayDecisionDraft(replayInput([], null))).toBeNull();
  });
});
