import type { ReactElement } from "react";

type StepState = "done" | "current" | "upcoming";

interface StepsProps {
  readonly label: string;
  readonly items: readonly { label: string; state: StepState }[];
}

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
