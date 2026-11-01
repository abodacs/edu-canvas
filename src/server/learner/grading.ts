import type { PrivateAnswerRelationship } from "@/server/records/private-answers";
import type { Correctness } from "@/server/records/vocabulary";

/**
 * #6 matching grader. The client never supplies a score: the caller loads the private answer relationships and passes the submitted pairs. Score = correct / (required + incorrect) x 100. A repeated source, an unknown source, or a target outside the answer set is incorrect. A required source with no correct pair lowers the score by omission, not by penalty.
 */
export const matchingGradingRuleVersion = "matching-grader-v1";

const percentScale = 100;
const zero = 0;
const one = 1;

export interface SubmittedPair {
  readonly sourceId: string;
  readonly targetId: string;
}

export interface MatchingGrade {
  readonly score: number;
  readonly correctness: Correctness;
  readonly requiredMatches: number;
  readonly correctMatches: number;
  readonly incorrectMatches: number;
  readonly missingMatches: number;
}

interface AnswerIndex {
  readonly targetsBySource: ReadonlyMap<string, ReadonlySet<string>>;
}

const indexAnswers = (
  relationships: readonly PrivateAnswerRelationship[]
): AnswerIndex => {
  const targetsBySource = new Map<string, ReadonlySet<string>>();
  for (const relationship of relationships) {
    targetsBySource.set(
      relationship.itemId,
      new Set(relationship.correctTargetIds)
    );
  }
  return { targetsBySource };
};

const isCorrectPair = (answers: AnswerIndex, pair: SubmittedPair): boolean => {
  const targets = answers.targetsBySource.get(pair.sourceId);
  return targets?.has(pair.targetId) === true;
};

const decideCorrectness = (input: {
  readonly correctMatches: number;
  readonly incorrectMatches: number;
  readonly requiredMatches: number;
}): Correctness => {
  const hasNoAnswer = input.requiredMatches === zero;
  const hasIncorrectMatches = input.incorrectMatches > zero;
  const hasNoCorrectMatches = input.correctMatches === zero;
  if (hasNoAnswer || hasIncorrectMatches || hasNoCorrectMatches) {
    return "incorrect";
  }
  return input.correctMatches === input.requiredMatches ? "correct" : "partial";
};

export const gradeMatching = (input: {
  readonly relationships: readonly PrivateAnswerRelationship[];
  readonly pairs: readonly SubmittedPair[];
}): MatchingGrade => {
  const answers = indexAnswers(input.relationships);
  const seenSources = new Set<string>();
  let correctMatches = zero;
  let incorrectMatches = zero;

  for (const pair of input.pairs) {
    if (seenSources.has(pair.sourceId)) {
      incorrectMatches += one;
      continue;
    }
    seenSources.add(pair.sourceId);
    if (isCorrectPair(answers, pair)) {
      correctMatches += one;
    } else {
      incorrectMatches += one;
    }
  }

  const requiredMatches = answers.targetsBySource.size;
  const missingMatches = Math.max(requiredMatches - correctMatches, zero);
  const weightedTotal = requiredMatches + incorrectMatches;
  const score =
    weightedTotal === zero
      ? zero
      : Math.round((correctMatches / weightedTotal) * percentScale);

  return {
    score,
    correctness: decideCorrectness({
      correctMatches,
      incorrectMatches,
      requiredMatches,
    }),
    requiredMatches,
    correctMatches,
    incorrectMatches,
    missingMatches,
  };
};
