import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canonicalJson } from "@/server/records/canonical-json";
import {
  decideNextActivity,
  decisionRuleDigest,
  decisionRuleRows,
  decisionRuleVersion,
} from "./decision";
import type { ActivityOption, DecisionEvidence } from "./decision";

const activities: readonly ActivityOption[] = [
  { activityId: "variant-standard-a", kind: "standard" },
  { activityId: "variant-standard-b", kind: "standard" },
  { activityId: "variant-scaffold", kind: "scaffold" },
  { activityId: "variant-challenge", kind: "challenge" },
];

const evidence = (
  overrides: Partial<DecisionEvidence> = {}
): DecisionEvidence => {
  return {
    assignedActivityId: "variant-standard-a",
    independent: { correctness: "correct", assisted: false },
    guided: { correctness: "correct", assisted: false },
    activities,
    ...overrides,
  };
};

describe(decideNextActivity, () => {
  it("pauses when the independent response is missing", () => {
    const outcome = decideNextActivity(evidence({ independent: null }));

    expect(outcome).toMatchObject({
      purpose: "pause",
      activityId: null,
      reason: "Independent evidence is missing.",
    });
  });

  it("offers a scaffold when the independent response is wrong or assisted", () => {
    expect(
      decideNextActivity(
        evidence({
          independent: { correctness: "incorrect", assisted: false },
        })
      )
    ).toMatchObject({
      purpose: "scaffold",
      activityId: "variant-scaffold",
    });
    expect(
      decideNextActivity(
        evidence({
          independent: { correctness: "correct", assisted: true },
        })
      )
    ).toMatchObject({ purpose: "scaffold" });
    expect(
      decideNextActivity(
        evidence({
          independent: { correctness: "partial", assisted: false },
        })
      )
    ).toMatchObject({ purpose: "scaffold" });
  });

  it("offers another standard when guided practice needed help", () => {
    expect(
      decideNextActivity(
        evidence({ guided: { correctness: "correct", assisted: true } })
      )
    ).toMatchObject({
      purpose: "standard",
      activityId: "variant-standard-b",
    });
    expect(
      decideNextActivity(
        evidence({ guided: { correctness: "incorrect", assisted: false } })
      )
    ).toMatchObject({ purpose: "standard" });
  });

  it("offers the challenge when both responses are independent and correct", () => {
    expect(decideNextActivity(evidence())).toMatchObject({
      purpose: "challenge",
      activityId: "variant-challenge",
    });
  });

  it("offers another standard when guided evidence is absent", () => {
    expect(decideNextActivity(evidence({ guided: null }))).toMatchObject({
      purpose: "standard",
      activityId: "variant-standard-b",
    });
  });

  it("pauses when the approved activity of the required kind is missing", () => {
    const withoutChallenge = activities.filter(
      (activity) => activity.kind !== "challenge"
    );

    expect(
      decideNextActivity(evidence({ activities: withoutChallenge }))
    ).toMatchObject({
      purpose: "pause",
      activityId: null,
      reason: "The approved follow-up content is missing.",
    });
  });

  it("pauses rather than proposing the activity already assigned", () => {
    const onlyAssigned = activities.filter(
      (activity) => activity.activityId !== "variant-standard-b"
    );

    expect(
      decideNextActivity(evidence({ activities: onlyAssigned, guided: null }))
    ).toMatchObject({
      purpose: "pause",
      activityId: null,
      reason: "The approved follow-up content is missing.",
    });
  });

  it("is pure: the same evidence gives the same bytes", () => {
    const first = decideNextActivity(evidence());
    const second = decideNextActivity(evidence());

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("decision rule version", () => {
  const pinnedRuleVersion = "next-activity-rule-591a157cd85e";

  it("pins the version so a changed row invalidates stored vectors", () => {
    expect(decisionRuleVersion).toBe(pinnedRuleVersion);
  });

  it("embeds the digest of the checked-in table", () => {
    const digest = createHash("sha256")
      .update(canonicalJson(decisionRuleRows), "utf-8")
      .digest("hex");

    expect(decisionRuleDigest).toBe(digest);
    expect(decisionRuleVersion).toBe(
      `next-activity-rule-${digest.slice(0, 12)}`
    );
  });

  it("changes when a row changes", () => {
    const mutated = decisionRuleRows.map((row, index) =>
      index === 0 ? { ...row, when: `${row.when} ` } : row
    );
    const digest = createHash("sha256")
      .update(canonicalJson(mutated), "utf-8")
      .digest("hex");

    expect(digest).not.toBe(decisionRuleDigest);
  });

  it("fires every declared row through the function", () => {
    const rowCases = [
      {
        id: "independent-missing",
        item: evidence({ independent: null }),
        purpose: "pause",
      },
      {
        id: "independent-not-correct",
        item: evidence({
          independent: { correctness: "incorrect", assisted: false },
        }),
        purpose: "scaffold",
      },
      {
        id: "guided-assisted",
        item: evidence({
          guided: { correctness: "correct", assisted: true },
        }),
        purpose: "standard",
      },
      {
        id: "ready-for-challenge",
        item: evidence(),
        purpose: "challenge",
      },
      {
        id: "guided-missing",
        item: evidence({ guided: null }),
        purpose: "standard",
      },
    ] as const;

    expect(rowCases.map((row) => row.id)).toStrictEqual(
      decisionRuleRows.map((row) => row.id)
    );

    for (const row of rowCases) {
      expect(decideNextActivity(row.item).purpose, `row ${row.id}`).toBe(
        row.purpose
      );
    }
  });
});
