import type { LearnerAttemptResponse } from "@/shared/learner-contract";

/**
#7 learner reveal surfaces. Every string is either approved copy arriving in
the attempt response or a fixed local template; the component adds none.
*/
export const RevealReport = ({
  reveal,
}: {
  readonly reveal: LearnerAttemptResponse["reveal"];
}) => {
  return (
    <section className="learn-reveal" aria-labelledby="learn-reveal-heading">
      <h2 id="learn-reveal-heading">Your check</h2>
      <ul className="learn-pairs">
        {reveal.pairs.map((pair) => {
          return (
            <li
              className="learn-pair"
              key={pair.sourceId}
              data-correct={pair.correct ? "true" : "false"}
            >
              <span>
                {pair.sourceLabel} to {pair.targetLabel}
              </span>
              <span className="learn-pair-state">
                {pair.correct ? "Correct" : "Not yet"}
              </span>
            </li>
          );
        })}
      </ul>
      {reveal.unresolved.length > 0 ? (
        <p className="learn-unresolved">
          Still to match:{" "}
          {reveal.unresolved.map((entry) => entry.sourceLabel).join(", ")}
        </p>
      ) : null}
      {reveal.feedback === null ? null : (
        <p className="learn-feedback">{reveal.feedback}</p>
      )}
      {reveal.connection === null ? null : (
        <p className="learn-connection">{reveal.connection}</p>
      )}
    </section>
  );
};

export const NextActivityCard = ({
  activity,
}: {
  readonly activity: LearnerAttemptResponse["nextActivity"];
}) => {
  const isWaiting = activity === null || activity.purpose === "pause";
  return (
    <section className="learn-next" aria-labelledby="learn-next-heading">
      <h2 id="learn-next-heading">What next</h2>
      {activity === null ? null : <p>{activity.reason}</p>}
      {isWaiting ? (
        <p>Your teacher is choosing the next activity.</p>
      ) : (
        <p>Your next approved activity is ready.</p>
      )}
    </section>
  );
};
