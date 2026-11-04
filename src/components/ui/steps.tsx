import type { ReactElement } from "react";

type StepState = "done" | "current" | "upcoming";

interface StepsProps {
  readonly label: string;
  readonly items: readonly { label: string; state: StepState }[];
}

/**
An ordered progress list. Exactly one item carries `aria-current="step"`: the
first `current` item (a second one is shown but not announced as current).
A done item says "Completed" in text, not only by colour.
*/
const Steps = ({ label, items }: StepsProps): ReactElement => {
  const currentIndex = items.findIndex((item) => item.state === "current");
  return (
    <ol className="steps" aria-label={label}>
      {items.map((item, index) => (
        <li
          key={item.label}
          className="steps__item"
          data-state={item.state}
          aria-current={index === currentIndex ? "step" : undefined}
        >
          <span className="steps__number" aria-hidden="true">
            {index + 1}
          </span>
          {item.state === "done" ? (
            <span className="sr-only">Completed: </span>
          ) : null}
          {item.label}
        </li>
      ))}
    </ol>
  );
};

export { Steps };
export type { StepsProps, StepState };
