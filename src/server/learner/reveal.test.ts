import { describe, expect, it } from "vitest";

import { buildReveal } from "./reveal";
import type { RevealInput } from "./reveal";

const rationale =
  "Both fractions describe the same part because equal parts keep the same value when both numbers are multiplied by the same factor.";

const input = (overrides: Partial<RevealInput> = {}): RevealInput => {
  return {
    items: [
      { id: "source-half", label: "1/2" },
      { id: "source-thirds", label: "2/3" },
      { id: "target-half", label: "2/4" },
      { id: "target-thirds", label: "4/6" },
      { id: "distractor", label: "3/4" },
    ],
    relationships: [
      { itemId: "source-half", correctTargetIds: ["target-half"] },
      { itemId: "source-thirds", correctTargetIds: ["target-thirds"] },
    ],
    pairs: [
      { sourceId: "source-half", targetId: "target-half" },
      { sourceId: "source-thirds", targetId: "target-thirds" },
    ],
    correctness: "correct",
    feedback: {
      correct: "Yes. Both names describe the same part.",
      incorrect: "Not yet. Multiply both parts by the same number.",
    },
    rationale,
    language: "en",
    ...overrides,
  };
};

describe(buildReveal, () => {
  it("names each matched pair and the approved connection", () => {
    const reveal = buildReveal(input());

    expect(reveal.ruleVersion).toBe("reveal-v1");
    expect(
      reveal.pairs.map((pair) => {
        return {
          source: pair.sourceLabel,
          target: pair.targetLabel,
          correct: pair.correct,
        };
      })
    ).toStrictEqual([
      { source: "1/2", target: "2/4", correct: true },
      { source: "2/3", target: "4/6", correct: true },
    ]);
    expect(reveal.unresolved).toStrictEqual([]);
    expect(reveal.feedback).toBe("Yes. Both names describe the same part.");
    expect(reveal.connection).toBe(
      "equal parts keep the same value when both numbers are multiplied by the same factor."
    );
  });

  it("keeps the connection a byte slice when approved copy carries extra whitespace", () => {
    const spaced =
      "Both fractions describe the same part because equal parts  keep the same value when both numbers are multiplied by the same factor.";
    const reveal = buildReveal(input({ rationale: spaced }));

    expect(reveal.connection).toBe(
      "equal parts  keep the same value when both numbers are multiplied by the same factor."
    );
    expect(spaced).toContain(reveal.connection ?? "");
  });

  it("reports an unmatched required pair and the corrective feedback", () => {
    const reveal = buildReveal(
      input({
        pairs: [{ sourceId: "source-thirds", targetId: "target-thirds" }],
        correctness: "partial",
      })
    );

    expect(reveal.pairs).toHaveLength(1);
    expect(reveal.unresolved).toStrictEqual([
      { sourceId: "source-half", sourceLabel: "1/2" },
    ]);
    expect(reveal.feedback).toBe(
      "Not yet. Multiply both parts by the same number."
    );
  });

  it("marks a distractor target incorrect and never shows its answer", () => {
    const reveal = buildReveal(
      input({
        pairs: [{ sourceId: "source-half", targetId: "distractor" }],
        correctness: "incorrect",
      })
    );

    expect(reveal.pairs).toStrictEqual([
      {
        sourceId: "source-half",
        sourceLabel: "1/2",
        targetId: "distractor",
        targetLabel: "3/4",
        correct: false,
      },
    ]);
    expect(reveal.unresolved).toStrictEqual([
      { sourceId: "source-half", sourceLabel: "1/2" },
      { sourceId: "source-thirds", sourceLabel: "2/3" },
    ]);
    expect(JSON.stringify(reveal)).not.toContain('"correctTargetIds"');
  });

  it("keeps the first pair per source, matching the grader", () => {
    const reveal = buildReveal(
      input({
        pairs: [
          { sourceId: "source-half", targetId: "distractor" },
          { sourceId: "source-half", targetId: "target-half" },
        ],
        correctness: "incorrect",
      })
    );

    expect(reveal.pairs).toHaveLength(1);
    expect(reveal.pairs[0]?.correct).toBeFalsy();
  });

  it("uses approved copy verbatim and degrades when copy is absent", () => {
    const approved = buildReveal(input());

    expect(approved.feedback).toBe("Yes. Both names describe the same part.");
    expect(rationale).toContain(approved.connection ?? "");

    const bare = buildReveal(input({ feedback: null, rationale: null }));

    expect(bare.feedback).toBeNull();
    expect(bare.connection).toBeNull();
    expect(bare.pairs).toHaveLength(2);
  });
});
