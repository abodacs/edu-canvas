import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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

/**
Pair numbers in the order the learner formed them. A target can be chosen by
more than one source, so it may carry several numbers.
*/
const pairNumbers = (pairs: Readonly<Record<string, string>>) => {
  const bySource = new Map<string, number>();
  const byTarget = new Map<string, number[]>();
  for (const [index, [sourceId, targetId]] of Object.entries(pairs).entries()) {
    const pairNumber = index + 1;
    bySource.set(sourceId, pairNumber);
    byTarget.set(targetId, [...(byTarget.get(targetId) ?? []), pairNumber]);
  }
  return { bySource, byTarget };
};

/**
The visible pair label. It is part of the button's name, so a screen reader
hears "1/2 Pair 1" on both cards of the pair. The tick is decoration only.
*/
const PairBadge = ({
  copy,
  pairNumber,
}: {
  readonly copy: LearnerCopy;
  readonly pairNumber: number;
}) => {
  return (
    <span className="learn-item__pair">
      <svg
        aria-hidden="true"
        className="learn-item__tick"
        fill="none"
        focusable="false"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
        viewBox="0 0 24 24"
      >
        <path d="M5 12.5 10 17 19 7" />
      </svg>
      {copy.pairBadge(pairNumber)}
    </span>
  );
};

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
  const { bySource, byTarget } = pairNumbers(pairs);
  return (
    <div className="learn-board" data-locked={isLocked ? "true" : undefined}>
      <div>
        <h2 className="learn-column-heading" id="learn-sources-heading">
          {sourceHeading}
        </h2>
        <ul className="learn-list" aria-labelledby="learn-sources-heading">
          {sources.map((item) => {
            const pairNumber = bySource.get(item.id);
            return (
              <li key={item.id}>
                <button
                  aria-pressed={activeSource === item.id}
                  className="learn-item"
                  data-paired={pairNumber === undefined ? "false" : "true"}
                  data-source=""
                  disabled={isLocked}
                  type="button"
                  onClick={() => {
                    onSelectSource(item.id);
                  }}
                >
                  <span className="learn-item__label">
                    <BidiText text={item.label} direction={direction} />
                  </span>
                  {pairNumber === undefined ? null : (
                    <PairBadge copy={copy} pairNumber={pairNumber} />
                  )}
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
            const numbers = byTarget.get(item.id) ?? [];
            return (
              <li key={item.id}>
                <button
                  className="learn-item"
                  data-paired={numbers.length > 0 ? "true" : "false"}
                  data-target=""
                  disabled={activeSource === null || isLocked}
                  type="button"
                  onClick={() => {
                    onSelectTarget(item.id);
                  }}
                >
                  <span className="learn-item__label">
                    <BidiText text={item.label} direction={direction} />
                  </span>
                  {numbers.map((pairNumber) => (
                    <PairBadge
                      copy={copy}
                      key={pairNumber}
                      pairNumber={pairNumber}
                    />
                  ))}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

/**
The finish row: Done, the progress line beside it, and Clear at the far end.
The progress line is visible text, not a live region; the page's single
`<output>` announces each change.
*/
export const BoardActions = ({
  copy,
  progress,
  isSaving,
  hasPairs,
  onSubmit,
  onClear,
}: {
  readonly copy: LearnerCopy;
  readonly progress: string;
  readonly isSaving: boolean;
  readonly hasPairs: boolean;
  readonly onSubmit: () => void;
  readonly onClear: () => void;
}) => {
  const isDisabled = isSaving || !hasPairs;
  return (
    <div className="learn-actions">
      <Button
        className="learn-submit"
        disabled={isDisabled}
        size="lg"
        type="button"
        onClick={onSubmit}
      >
        {isSaving ? copy.checking : copy.submit}
      </Button>
      <p className="learn-status" id="learn-progress">
        {progress}
      </p>
      <Button
        className="learn-retry learn-clear"
        disabled={isDisabled}
        type="button"
        variant="ghost"
        onClick={onClear}
      >
        {copy.clear}
      </Button>
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
    <Card className="learn-result-panel">
      <p className="learn-result">{scoreLine(copy, result)}</p>
      <CheckOutcome correctness={result.correctness} copy={copy} />
      <RevealReport
        reveal={result.reveal}
        copy={copy}
        headingRef={revealHeadingReference}
      />
      <NextActivityCard activity={result.nextActivity} copy={copy} />
      <div className="learn-result-actions">
        <Button className="learn-retry" type="button" onClick={onRetry}>
          {copy.retry}
        </Button>
      </div>
    </Card>
  );
};
