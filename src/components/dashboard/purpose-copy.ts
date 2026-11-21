import type { BadgeTone } from "@/components/ui/badge";
import type { ProgressRun } from "@/shared/progress-contract";

type DecisionPurpose = NonNullable<ProgressRun["decision"]>["purpose"];
type RunStage = ProgressRun["stage"];

interface StageStatus {
  readonly label: string;
  readonly tone: BadgeTone;
}

const purposeCopy: Record<DecisionPurpose, string> = {
  pause: "Waiting for the first response",
  scaffold: "Needs another supported go",
  standard: "Ready for more independent practice",
  challenge: "Ready for a harder challenge",
  "teacher-choice": "You chose this activity",
};

export const purposeLabel = (purpose: DecisionPurpose): string =>
  purposeCopy[purpose];

const stageCopy: Record<RunStage, StageStatus> = {
  assigned: { label: "Assigned", tone: "idle" },
  active: { label: "In progress", tone: "idle" },
  "awaiting-decision": { label: "Waiting for a decision", tone: "warn" },
  paused: { label: "Paused", tone: "warn" },
  advanced: { label: "Moved on", tone: "ok" },
  completed: { label: "Finished", tone: "ok" },
};

export const stageStatus = (stage: RunStage): StageStatus => stageCopy[stage];
