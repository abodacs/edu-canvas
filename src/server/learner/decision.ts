import { createHash } from "node:crypto";

import { canonicalJson } from "@/server/records/canonical-json";
import type { variantKindValues } from "@/shared/generation-contract";
import type { NextActivityPurpose } from "@/shared/learner-contract";
import type { Correctness } from "@/server/records/vocabulary";

/**
 * #7 deterministic next-activity rule.
 *
 * The rule is a checked-in table. The version string embeds a digest of the table, so a changed row without a changed version fails the unit test. The function reads no clock, no client input, and no database.
 */

/**
The purposes this rule can decide. The canonical vocabulary lives in the shared contract; the teacher's own choice never comes from this function.
*/
export type RulePurpose = Exclude<NextActivityPurpose, "teacher-choice">;

export type ActivityKind = (typeof variantKindValues)[number];

export interface ActivityOption {
  readonly activityId: string;
  readonly kind: ActivityKind;
}

export interface ResponseEvidence {
  readonly correctness: Correctness;
  readonly assisted: boolean;
}

export interface DecisionEvidence {
  readonly assignedActivityId: string;
  /**
  The first response on the assigned activity. Null when nothing is stored.
  */
  readonly independent: ResponseEvidence | null;
  /**
  The first response on guided practice. Null until a stage model exists.
  */
  readonly guided: ResponseEvidence | null;
  readonly activities: readonly ActivityOption[];
}

export interface DecisionOutcome {
  readonly activityId: string | null;
  readonly purpose: RulePurpose;
  readonly reason: string;
  readonly ruleVersion: string;
}

export const decisionReasonCopy = {
  pause: "Independent evidence is missing.",
  contentUnavailable: "The approved follow-up content is missing.",
  scaffold: "The learner needs another supported example.",
  standard: "The learner needs more independent practice.",
  challenge: "The learner can try a harder approved item.",
} as const;

export const decisionRuleRows = [
  {
    id: "independent-missing",
    when: "no first response on the assigned activity",
    purpose: "pause",
    preferredKind: null,
  },
  {
    id: "independent-not-correct",
    when: "assigned first response is incorrect, partial, or assisted",
    purpose: "scaffold",
    preferredKind: "scaffold",
  },
  {
    id: "guided-assisted",
    when: "assigned response correct and unassisted; guided response needs help",
    purpose: "standard",
    preferredKind: "standard",
  },
  {
    id: "ready-for-challenge",
    when: "assigned response correct and unassisted; guided response independent",
    purpose: "challenge",
    preferredKind: "challenge",
  },
  {
    id: "guided-missing",
    when: "assigned response correct and unassisted; no guided evidence exists",
    purpose: "standard",
    preferredKind: "standard",
  },
] as const satisfies readonly {
  readonly id: string;
  readonly when: string;
  readonly purpose: RulePurpose;
  readonly preferredKind: ActivityKind | null;
}[];

const digestOfRows = (): string => {
  return createHash("sha256")
    .update(canonicalJson(decisionRuleRows), "utf-8")
    .digest("hex");
};

/**
The version moves whenever a row moves. Prose rows carry no executable
predicates on purpose: `decideNextActivity` is the one reader, and the unit
test fires each row through it.
*/
export const decisionRuleVersion = `next-activity-rule-${digestOfRows().slice(0, 12)}`;

export const decisionRuleDigest = digestOfRows();

const isIndependent = (evidence: DecisionEvidence): boolean =>
  evidence.independent !== null;

const isUnassistedCorrect = (evidence: ResponseEvidence | null): boolean => {
  return (
    evidence !== null &&
    evidence.correctness === "correct" &&
    !evidence.assisted
  );
};

const isGuidedNeedingHelp = (evidence: ResponseEvidence | null): boolean =>
  evidence !== null && !isUnassistedCorrect(evidence);

const pickActivity = (
  evidence: DecisionEvidence,
  kind: ActivityKind
): string | null => {
  const other = evidence.activities.find((activity) => {
    return (
      activity.kind === kind &&
      activity.activityId !== evidence.assignedActivityId
    );
  });
  return other?.activityId ?? null;
};

const pause = (reason: string): DecisionOutcome => {
  return {
    activityId: null,
    purpose: "pause",
    reason,
    ruleVersion: decisionRuleVersion,
  };
};

const choose = (
  evidence: DecisionEvidence,
  purpose: Exclude<RulePurpose, "pause">
): DecisionOutcome => {
  const activityId = pickActivity(evidence, purpose);
  return activityId === null
    ? pause(decisionReasonCopy.contentUnavailable)
    : {
        activityId,
        purpose,
        reason: decisionReasonCopy[purpose],
        ruleVersion: decisionRuleVersion,
      };
};

export const decideNextActivity = (
  evidence: DecisionEvidence
): DecisionOutcome => {
  if (!isIndependent(evidence)) {
    return pause(decisionReasonCopy.pause);
  }
  if (!isUnassistedCorrect(evidence.independent)) {
    return choose(evidence, "scaffold");
  }
  if (evidence.guided === null) {
    return choose(evidence, "standard");
  }
  return choose(
    evidence,
    isGuidedNeedingHelp(evidence.guided) ? "standard" : "challenge"
  );
};
