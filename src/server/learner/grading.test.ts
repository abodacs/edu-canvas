import {
  array,
  assert as assertProperty,
  constantFrom,
  integer,
  property,
  record,
  uniqueArray,
} from "fast-check";
import { describe, expect, it } from "vitest";

import { gradeMatching, matchingGradingRuleVersion } from "./grading";
import type { SubmittedPair } from "./grading";
import type { PrivateAnswerRelationship } from "@/server/records/private-answers";

const relationships: readonly PrivateAnswerRelationship[] = [
  { itemId: "source-1", correctTargetIds: ["target-1"] },
  { itemId: "source-2", correctTargetIds: ["target-2"] },
  { itemId: "source-3", correctTargetIds: ["target-3"] },
];

const correct: readonly SubmittedPair[] = [
  { sourceId: "source-1", targetId: "target-1" },
  { sourceId: "source-2", targetId: "target-2" },
  { sourceId: "source-3", targetId: "target-3" },
];

// A second expression of the published rule. It shares no code with the
// implementation under test, so a slip in one shows up as a disagreement.
const oracleScore = (
  answers: readonly PrivateAnswerRelationship[],
  pairs: readonly SubmittedPair[]
): number => {
  const submitted = new Map<string, string>();
  let repeated = 0;
  for (const pair of pairs) {
    if (submitted.has(pair.sourceId)) {
      repeated += 1;
    } else {
      submitted.set(pair.sourceId, pair.targetId);
    }
  }

  const answerBySource = new Map<string, readonly string[]>();
  for (const answer of answers) {
    answerBySource.set(answer.itemId, answer.correctTargetIds);
  }
  let correctMatches = 0;
  for (const [sourceId, targetId] of submitted) {
    if (answerBySource.get(sourceId)?.includes(targetId) === true) {
      correctMatches += 1;
    }
  }

  const incorrectMatches = submitted.size - correctMatches + repeated;
  const denominator = answers.length + incorrectMatches;
  return denominator === 0
    ? 0
    : Math.round((correctMatches / denominator) * 100);
};

const sourceArbitrary = constantFrom("source-1", "source-2", "source-3");
const targetArbitrary = constantFrom("target-1", "target-2", "target-3");

const relationshipArbitrary = uniqueArray(
  record({
    itemId: sourceArbitrary,
    correctTargetIds: uniqueArray(targetArbitrary, {
      maxLength: 1,
      minLength: 1,
    }),
  }),
  { maxLength: 3, minLength: 1, selector: (entry) => entry.itemId }
);
const pairArbitrary = record({
  sourceId: constantFrom("source-1", "source-2", "source-3", "source-unknown"),
  targetId: constantFrom("target-1", "target-2", "target-3", "target-unknown"),
});

describe(matchingGradingRuleVersion, () => {
  it("pins the rule version the attempts record carries", () => {
    expect(matchingGradingRuleVersion).toBe("matching-grader-v1");
  });
});

describe(gradeMatching, () => {
  it("scores an exact all-and-only submission as correct", () => {
    expect(gradeMatching({ pairs: correct, relationships })).toMatchObject({
      score: 100,
      correctness: "correct",
      requiredMatches: 3,
      correctMatches: 3,
      incorrectMatches: 0,
      missingMatches: 0,
    });
  });

  it("awards deterministic partial credit when no pair is wrong", () => {
    expect(
      gradeMatching({ pairs: correct.slice(0, 2), relationships })
    ).toMatchObject({
      score: 67,
      correctness: "partial",
      correctMatches: 2,
      incorrectMatches: 0,
      missingMatches: 1,
    });
  });

  it("counts a wrong target against the score and never awards partial", () => {
    expect(
      gradeMatching({
        pairs: [
          ...correct.slice(0, 2),
          { sourceId: "source-3", targetId: "target-1" },
        ],
        relationships,
      })
    ).toMatchObject({
      correctness: "incorrect",
      correctMatches: 2,
      incorrectMatches: 1,
      score: 50,
    });
  });

  it("counts a repeated source and an unknown source as incorrect", () => {
    expect(
      gradeMatching({
        pairs: [
          ...correct,
          { sourceId: "source-1", targetId: "target-1" },
          { sourceId: "source-unknown", targetId: "target-1" },
        ],
        relationships,
      })
    ).toMatchObject({
      correctness: "incorrect",
      correctMatches: 3,
      incorrectMatches: 2,
      score: 60,
    });
  });

  it("never accepts a caller-supplied score", () => {
    const tampered = {
      pairs: correct,
      relationships,
      score: 0,
    } as unknown as Parameters<typeof gradeMatching>[0];

    expect(gradeMatching(tampered).score).toBe(100);
  });
});

describe(gradeMatching, () => {
  it("keeps every score a safe integer from 0 through 100", () => {
    assertProperty(
      property(
        relationshipArbitrary,
        array(pairArbitrary, { maxLength: 6 }),
        (answers, pairs) => {
          const grade = gradeMatching({ pairs, relationships: answers });

          expect(Number.isSafeInteger(grade.score)).toBeTruthy();
          expect(grade.score).toBeGreaterThanOrEqual(0);
          expect(grade.score).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("agrees with an independent implementation of the published rule", () => {
    assertProperty(
      property(
        relationshipArbitrary,
        array(pairArbitrary, { maxLength: 6 }),
        (answers, pairs) => {
          const grade = gradeMatching({ pairs, relationships: answers });

          expect(grade.score).toBe(oracleScore(answers, pairs));
        }
      ),
      { numRuns: 200 }
    );
  });

  it("never raises a score when a wrong pair is added", () => {
    assertProperty(
      property(
        relationshipArbitrary,
        array(pairArbitrary, { maxLength: 5 }),
        integer({ max: 3, min: 1 }),
        (answers, pairs, pick) => {
          const before = gradeMatching({
            pairs,
            relationships: answers,
          }).score;
          const wrongPair: SubmittedPair = {
            sourceId: `source-${pick}`,
            targetId: "target-unknown",
          };
          const after = gradeMatching({
            pairs: [...pairs, wrongPair],
            relationships: answers,
          }).score;

          expect(after).toBeLessThanOrEqual(before);
        }
      ),
      { numRuns: 200 }
    );
  });
});
