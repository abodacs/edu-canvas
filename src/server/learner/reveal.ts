import { extractConnectionExplanation } from "@/shared/story-plan";
import type { StoryLanguage } from "@/shared/story-plan";
import type { Correctness } from "@/server/records/vocabulary";

/**
 * #7 reveal report.
 *
 * A pure read over one stored submission and the private answer relationships.
 * It returns identities the learner already sent, never an answer they did not submit. The connection sentence is an exact slice of the approved rationale.
 */
export const revealRuleVersion = "reveal-v1";

export interface RevealItem {
  readonly id: string;
  readonly label: string;
}

export interface RevealPair {
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly targetId: string;
  readonly targetLabel: string;
  readonly correct: boolean;
}

export interface RevealUnresolved {
  readonly sourceId: string;
  readonly sourceLabel: string;
}

export interface RevealFeedback {
  readonly correct: string;
  readonly incorrect: string;
}

export interface Reveal {
  readonly ruleVersion: string;
  readonly pairs: readonly RevealPair[];
  readonly unresolved: readonly RevealUnresolved[];
  readonly feedback: string | null;
  readonly connection: string | null;
}

export interface RevealRelationship {
  readonly itemId: string;
  readonly correctTargetIds: readonly string[];
}

export interface RevealInput {
  readonly items: readonly RevealItem[];
  readonly relationships: readonly RevealRelationship[];
  readonly pairs: readonly {
    readonly sourceId: string;
    readonly targetId: string;
  }[];
  readonly correctness: Correctness;
  readonly feedback: RevealFeedback | null;
  readonly rationale: string | null;
  readonly language: StoryLanguage;
}

const labelOf = (labels: ReadonlyMap<string, string>, id: string): string =>
  labels.get(id) ?? id;

const indexLabels = (items: readonly RevealItem[]): Map<string, string> =>
  new Map(items.map((item) => [item.id, item.label]));

const indexAnswers = (
  relationships: readonly RevealRelationship[]
): Map<string, ReadonlySet<string>> => {
  return new Map(
    // eslint-disable-next-line unicorn/consistent-arrow-return-style -- prettier breaks the tuple, so the body spans lines.
    relationships.map((relationship) => [
      relationship.itemId,
      new Set(relationship.correctTargetIds),
    ])
  );
};

const classifyPairs = (input: RevealInput): RevealPair[] => {
  const labels = indexLabels(input.items);
  const answers = indexAnswers(input.relationships);
  const seen = new Set<string>();
  const pairs: RevealPair[] = [];
  for (const pair of input.pairs) {
    if (seen.has(pair.sourceId)) {
      continue;
    }
    seen.add(pair.sourceId);
    pairs.push({
      sourceId: pair.sourceId,
      sourceLabel: labelOf(labels, pair.sourceId),
      targetId: pair.targetId,
      targetLabel: labelOf(labels, pair.targetId),
      correct: answers.get(pair.sourceId)?.has(pair.targetId) === true,
    });
  }
  return pairs;
};

const unresolvedSources = (
  input: RevealInput,
  pairs: readonly RevealPair[]
): RevealUnresolved[] => {
  const labels = indexLabels(input.items);
  const resolved = new Set(
    pairs.filter((pair) => pair.correct).map((pair) => pair.sourceId)
  );
  return input.relationships
    .filter((relationship) => !resolved.has(relationship.itemId))
    .map((relationship) => {
      return {
        sourceId: relationship.itemId,
        sourceLabel: labelOf(labels, relationship.itemId),
      };
    });
};

const chooseFeedback = (input: RevealInput): string | null => {
  if (input.feedback === null) {
    return null;
  }
  return input.correctness === "correct"
    ? input.feedback.correct
    : input.feedback.incorrect;
};

const connectionOf = (input: RevealInput): string | null => {
  const rationale = input.rationale?.trim() ?? "";
  return rationale.length === 0
    ? null
    : extractConnectionExplanation(rationale, input.language);
};

export const buildReveal = (input: RevealInput): Reveal => {
  const pairs = classifyPairs(input);
  return {
    ruleVersion: revealRuleVersion,
    pairs,
    unresolved: unresolvedSources(input, pairs),
    feedback: chooseFeedback(input),
    connection: connectionOf(input),
  };
};
