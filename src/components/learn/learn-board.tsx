import { BidiText } from "./bidi-text";
import { scoreLine } from "./learner-copy";
import { CheckOutcome, NextActivityCard, RevealReport } from "./learn-surfaces";
import type { LearnerCopy } from "./learner-copy";
import type { Ref } from "react";
import type {
  LearnerAttemptResponse,
  LearnerItem,
} from "@/shared/learner-contract";

/**
#9 learner board pieces. Each control carries a data hook (`data-source`,
`data-target`) so the page can name where focus lands after an action
removes or disables the focused control.
*/

export const MatchingColumns = ({
  copy,
  sourceHeading,
  targetHeading,
  sources,
  targets,
  pairs,
  activeSource,
  isLocked,
  onSelectSource,
  onSelectTarget,
}: {
  readonly copy: LearnerCopy;
  readonly sourceHeading: string;
  readonly targetHeading: string;
  readonly sources: readonly LearnerItem[];
  readonly targets: readonly LearnerItem[];
  readonly pairs: Readonly<Record<string, string>>;
  readonly activeSource: string | null;
  readonly isLocked: boolean;
  readonly onSelectSource: (sourceId: string) => void;
  readonly onSelectTarget: (targetId: string) => void;
}) => {
  const { direction } = copy;
  return (
    <div className="learn-board">
      <div>
        <h2 className="learn-column-heading" id="learn-sources-heading">
          {sourceHeading}
        </h2>
        <ul className="learn-list" aria-labelledby="learn-sources-heading">
          {sources.map((item) => {
            const isPaired = pairs[item.id] !== undefined;
            return (
              <li key={item.id}>
                <button
                  aria-pressed={activeSource === item.id}
                  className="learn-item"
                  data-paired={isPaired ? "true" : "false"}
                  data-source=""
                  disabled={isLocked}
                  type="button"
                  onClick={() => {
                    onSelectSource(item.id);
                  }}
                >
                  <BidiText text={item.label} direction={direction} />
                  {isPaired ? copy.matchedSuffix : ""}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <h2 className="learn-column-heading" id="learn-targets-heading">
          {targetHeading}
        </h2>
        <ul className="learn-list" aria-labelledby="learn-targets-heading">
          {targets.map((item) => {
            return (
              <li key={item.id}>
                <button
                  className="learn-item"
                  data-target=""
                  disabled={activeSource === null || isLocked}
                  type="button"
                  onClick={() => {
                    onSelectTarget(item.id);
                  }}
                >
                  <BidiText text={item.label} direction={direction} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export const BoardActions = ({
  copy,
  isSaving,
  hasPairs,
  onSubmit,
  onClear,
}: {
  readonly copy: LearnerCopy;
  readonly isSaving: boolean;
  readonly hasPairs: boolean;
  readonly onSubmit: () => void;
  readonly onClear: () => void;
}) => {
  const isDisabled = isSaving || !hasPairs;
  return (
    <div className="learn-actions">
      <button
        className="learn-submit"
        disabled={isDisabled}
        type="button"
        onClick={onSubmit}
      >
        {isSaving ? copy.checking : copy.submit}
      </button>
      <button
        className="learn-retry"
        disabled={isDisabled}
        type="button"
        onClick={onClear}
      >
        {copy.clear}
      </button>
    </div>
  );
};

export const ResultPanel = ({
  copy,
  result,
  revealHeadingReference,
  onRetry,
}: {
  readonly copy: LearnerCopy;
  readonly result: LearnerAttemptResponse;
  readonly revealHeadingReference: Ref<HTMLHeadingElement>;
  readonly onRetry: () => void;
}) => {
  return (
    <div className="learn-result-panel">
      <p className="learn-result">{scoreLine(copy, result)}</p>
      <CheckOutcome correctness={result.correctness} copy={copy} />
      <RevealReport
        reveal={result.reveal}
        copy={copy}
        headingRef={revealHeadingReference}
      />
      <NextActivityCard activity={result.nextActivity} copy={copy} />
      <button className="learn-retry" type="button" onClick={onRetry}>
        {copy.retry}
      </button>
    </div>
  );
};
