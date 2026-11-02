import { createDecisionEvidenceHash } from "@/server/records/hashes";
import { decideNextActivity } from "./decision";
import type {
  LearnerAttempt,
  NextActivityDraft,
} from "@/server/records/delivery";
import type { AssistanceState, Correctness } from "@/server/records/vocabulary";

import type { ActivityKind } from "./decision";

/**
 * #7: the evidence a decision is built from, and the replay of that build from
 * stored rows. The write path (learner service) and the teacher read path call
 * this one module, so a stored reason and a re-derived reason cannot drift.
 */

export interface FirstResponse {
  readonly itemId: string;
  readonly correctness: Correctness;
  readonly assisted: boolean;
  readonly assistanceEventIds: readonly string[];
}

export interface DecisionActivityOption {
  readonly activityId: string;
  readonly kind: ActivityKind;
}

export const wasAssisted = (input: {
  readonly assistanceState: AssistanceState;
  readonly assistanceEventIds: readonly string[];
}): boolean => {
  return (
    input.assistanceState === "hinted" || input.assistanceEventIds.length > 0
  );
};

/**
The first response on the assigned section decides the route. Later attempts
append evidence but never change it, so the read takes the stored order as-is
(the caller passes it ordered by ordinal).
*/
export const firstStoredResponse = (
  attempts: readonly LearnerAttempt[],
  sectionItemIds: readonly string[]
): FirstResponse | null => {
  const first = attempts.find((attempt) =>
    sectionItemIds.includes(attempt.itemId)
  );
  return first
    ? {
        itemId: first.itemId,
        correctness: first.correctness,
        assisted: wasAssisted(first),
        assistanceEventIds: first.assistanceEventIds,
      }
    : null;
};

export interface BuildDecisionInput {
  readonly runId: string;
  readonly assignedActivityId: string;
  readonly activities: readonly DecisionActivityOption[];
  /**
  The first response on the assigned activity. The write path stands in its in-flight submission when nothing is stored yet; the replay stands in the attempt the stored decision derived from.
  */
  readonly first: FirstResponse;
}

export const buildDecisionDraft = (
  input: BuildDecisionInput
): NextActivityDraft => {
  const evidenceHash = createDecisionEvidenceHash({
    runId: input.runId,
    itemId: input.first.itemId,
    correctness: input.first.correctness,
    assisted: input.first.assisted,
    assistanceEventIds: input.first.assistanceEventIds,
  });
  const outcome = decideNextActivity({
    assignedActivityId: input.assignedActivityId,
    independent: {
      correctness: input.first.correctness,
      assisted: input.first.assisted,
    },
    // The run model has one stage. Guided evidence stays null until a
    // multi-stage run exists, so the rule's guided rows are fixture-only.
    guided: null,
    activities: input.activities,
  });
  return {
    activityId: outcome.activityId,
    activityAxis: "variant-kind",
    purpose: outcome.purpose,
    reason: outcome.reason,
    ruleVersion: outcome.ruleVersion,
    evidenceHash,
  };
};

export interface ReplayDecisionInput {
  readonly runId: string;
  readonly assignedActivityId: string;
  readonly activities: readonly DecisionActivityOption[];
  readonly sectionItemIds: readonly string[];
  /**
  Every stored attempt for the run, ordered by ordinal ascending.
  */
  readonly attempts: readonly LearnerAttempt[];
  /**
  The stored decision to replay. Its `derivedFromAttemptId` marks the write:
  attempts after it arrived later and must not change the re-derived reason.
  */
  readonly derivedFromAttemptId: string | null;
}

/**
Rebuild the decision the rule wrote for the stored evidence. When no attempt sat on the assigned section yet, the attempt the decision derived from stands in — exactly what the write path did with its in-flight submission. Returns null when the stored evidence cannot reproduce a first response at all.
*/
export const replayDecisionDraft = (
  input: ReplayDecisionInput
): NextActivityDraft | null => {
  const derived = input.derivedFromAttemptId
    ? input.attempts.find(
        (attempt) => attempt.id === input.derivedFromAttemptId
      )
    : null;
  const asOfWrite = derived
    ? input.attempts.filter((attempt) => attempt.ordinal <= derived.ordinal)
    : input.attempts;
  const first =
    firstStoredResponse(asOfWrite, input.sectionItemIds) ??
    (derived
      ? {
          itemId: derived.itemId,
          correctness: derived.correctness,
          assisted: wasAssisted(derived),
          assistanceEventIds: derived.assistanceEventIds,
        }
      : null);
  if (!first) {
    return null;
  }
  return buildDecisionDraft({
    runId: input.runId,
    assignedActivityId: input.assignedActivityId,
    activities: input.activities,
    first,
  });
};
