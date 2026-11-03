import type { ProgressRun } from "@/shared/progress-contract";

/**
 * #8 the teacher-facing routing words for a stored decision purpose. The
 * stored reason itself renders verbatim; this label only names the routing.
 */

type DecisionPurpose = NonNullable<ProgressRun["decision"]>["purpose"];

const purposeCopy: Record<DecisionPurpose, string> = {
  pause: "Waiting for the first response",
  scaffold: "Needs another supported go",
  standard: "Ready for more independent practice",
  challenge: "Ready for a harder challenge",
  "teacher-choice": "You chose this activity",
};

export const purposeLabel = (purpose: DecisionPurpose): string =>
  purposeCopy[purpose];
