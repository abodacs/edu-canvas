import { BidiText } from "./bidi-text";
import type { Ref } from "react";

import type { LearnerCopy } from "./learner-copy";
import type { LearnerAttemptResponse } from "@/shared/learner-contract";

/**
#7 learner reveal surfaces. Every string is either approved copy arriving in
the attempt response or a fixed template from the learner copy; the component
adds none.
*/

export const CheckOutcome = ({
  correctness,
  copy,
}: {
  readonly correctness: LearnerAttemptResponse["correctness"];
  readonly copy: LearnerCopy;
}) => {
  return (
    <p className="learn-outcome" data-correctness={correctness}>
      {copy.outcome[correctness]}
    </p>
  );
};

export const RepeatEvaluationNotice = ({
  copy,
}: {
  readonly copy: LearnerCopy;
}) => {
  return (
    <p className="learn-repeat" role="note">
      {copy.repeatNotice}
    </p>
  );
};

export const RevealReport = ({
  reveal,
  copy,
  headingRef,
}: {
  readonly reveal: LearnerAttemptResponse["reveal"];
  readonly copy: LearnerCopy;
  readonly headingRef?: Ref<HTMLHeadingElement>;
}) => {
  const { direction } = copy;
  return (
    <section className="learn-reveal" aria-labelledby="learn-reveal-heading">
      <h2 id="learn-reveal-heading" ref={headingRef} tabIndex={-1}>
        {copy.revealHeading}
      </h2>
      <ul className="learn-pairs">
        {reveal.pairs.map((pair) => {
          return (
            <li
              className="learn-pair"
              key={pair.sourceId}
              data-correct={pair.correct ? "true" : "false"}
            >
              <span>
                <BidiText text={pair.sourceLabel} direction={direction} />{" "}
                {copy.pairJoiner}{" "}
                <BidiText text={pair.targetLabel} direction={direction} />
              </span>
              <span className="learn-pair-state">
                {pair.correct ? copy.pairCorrect : copy.pairNotYet}
              </span>
            </li>
          );
        })}
      </ul>
      {reveal.unresolved.length > 0 ? (
        <p className="learn-unresolved">
          {copy.stillToMatch}{" "}
          <BidiText
            text={reveal.unresolved
              .map((entry) => entry.sourceLabel)
              .join(copy.listSeparator)}
            direction={direction}
          />
        </p>
      ) : null}
      {reveal.feedback === null ? null : (
        <p className="learn-feedback">
          <BidiText text={reveal.feedback} direction={direction} />
        </p>
      )}
      {reveal.connection === null ? null : (
        <p className="learn-connection">
          <BidiText text={reveal.connection} direction={direction} />
        </p>
      )}
    </section>
  );
};

export const NextActivityCard = ({
  activity,
  copy,
}: {
  readonly activity: LearnerAttemptResponse["nextActivity"];
  readonly copy: LearnerCopy;
}) => {
  const isWaiting = activity === null || activity.purpose === "pause";
  return (
    <section className="learn-next" aria-labelledby="learn-next-heading">
      <h2 id="learn-next-heading">{copy.nextHeading}</h2>
      {activity === null ? null : (
        <p>
          <BidiText text={activity.reason} direction={copy.direction} />
        </p>
      )}
      <p>{isWaiting ? copy.nextWaiting : copy.nextReady}</p>
    </section>
  );
};
