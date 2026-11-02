import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CheckOutcome,
  NextActivityCard,
  RepeatEvaluationNotice,
  RevealReport,
} from "./learn-surfaces";
import type { LearnerAttemptResponse } from "@/shared/learner-contract";

const render = (element: React.ReactElement): string =>
  renderToStaticMarkup(element);

const reveal = (
  overrides: Partial<LearnerAttemptResponse["reveal"]> = {}
): LearnerAttemptResponse["reveal"] => {
  return {
    ruleVersion: "reveal-v1",
    pairs: [
      {
        sourceId: "source-half",
        sourceLabel: "1/2",
        targetId: "distractor",
        targetLabel: "3/4",
        correct: false,
      },
    ],
    unresolved: [{ sourceId: "source-half", sourceLabel: "1/2" }],
    feedback: "Not yet. Multiply both parts by the same number.",
    connection: "equal parts keep the same value when both parts change.",
    ...overrides,
  };
};

describe(RevealReport, () => {
  it("renders the incorrect report for a distractor-only submission", () => {
    const markup = render(createElement(RevealReport, { reveal: reveal() }));

    expect(markup).toContain("Not yet");
    expect(markup).toContain("1/2 to 3/4");
    expect(markup).toContain("Still to match: 1/2");
    expect(markup).toContain("Multiply both parts by the same number.");
    expect(markup).toContain('data-correct="false"');
  });

  it("never renders the answer the learner did not submit", () => {
    const markup = render(createElement(RevealReport, { reveal: reveal() }));

    expect(markup).not.toContain("2/4");
    expect(markup).not.toContain("target-half");
  });

  it("degrades to pairs and labels when approved copy is absent", () => {
    const markup = render(
      createElement(RevealReport, {
        reveal: reveal({ feedback: null, connection: null }),
      })
    );

    expect(markup).toContain("learn-pair");
    expect(markup).not.toContain("learn-feedback");
    expect(markup).not.toContain("learn-connection");
  });
});

describe(NextActivityCard, () => {
  it("renders the pause surface without naming an activity", () => {
    const markup = render(
      createElement(NextActivityCard, {
        activity: {
          activityId: null,
          activityAxis: "variant-kind",
          purpose: "pause",
          reason: "Independent evidence is missing.",
          ruleVersion: "next-activity-rule-x",
          evidenceHash: "a".repeat(64),
          derivedFromAttemptId: null,
        },
      })
    );

    expect(markup).toContain("Independent evidence is missing.");
    expect(markup).toContain("Your teacher is choosing the next activity.");
    expect(markup).not.toContain("ready");
  });

  it("renders the ready surface for a decided activity", () => {
    const markup = render(
      createElement(NextActivityCard, {
        activity: {
          activityId: "variant_scaffold",
          activityAxis: "variant-kind",
          purpose: "scaffold",
          reason: "The learner needs another supported example.",
          ruleVersion: "next-activity-rule-x",
          evidenceHash: "a".repeat(64),
          derivedFromAttemptId: "attempt_1",
        },
      })
    );

    expect(markup).toContain("The learner needs another supported example.");
    expect(markup).toContain("Your next approved activity is ready.");
  });

  it("renders the waiting surface when no decision exists yet", () => {
    const markup = render(createElement(NextActivityCard, { activity: null }));

    expect(markup).toContain("Your teacher is choosing the next activity.");
  });
});

describe(CheckOutcome, () => {
  const correctnessStates = ["correct", "partial", "incorrect"] as const;

  it("renders an intentional surface for each correctness state", () => {
    for (const correctness of correctnessStates) {
      const markup = render(createElement(CheckOutcome, { correctness }));

      expect(markup).toContain(`data-correctness="${correctness}"`);
      expect(markup).toContain("<output");
    }
  });

  it("keeps every state's fixed template distinct", () => {
    const markups = correctnessStates.map((correctness) =>
      render(createElement(CheckOutcome, { correctness }))
    );

    const distinctMarkups = new Set(markups);

    expect(distinctMarkups.size).toBe(correctnessStates.length);
    expect(markups[0]).toContain("You matched every pair.");
    expect(markups[1]).toContain("Some matches are still missing.");
    expect(markups[2]).toContain("Not every match is right yet.");
  });
});

describe(RepeatEvaluationNotice, () => {
  it("names the repeat state without reclassifying the first response", () => {
    const markup = render(createElement(RepeatEvaluationNotice));

    expect(markup).toContain("This check repeats from the start.");
    expect(markup).toContain("Your first response stays on record.");
  });
});

describe("learn styles", () => {
  const stylesUrl = new URL("../../styles.css", import.meta.url);
  const styles = readFileSync(stylesUrl, "utf-8");

  it("wraps the board columns so they stack at 320px", () => {
    expect(styles).toContain(
      "grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));"
    );
  });

  it("adds no animation to the learner surfaces", () => {
    const learnBlock = styles.slice(styles.indexOf(".learn-card {"));

    expect(learnBlock).not.toMatch(/\banimation\b|\btransition\b|@keyframes/u);
  });
});
