import { useState } from "react";
import { cn } from "@/lib/utilities";
import type { ReactNode } from "react";

import type { A2UIComponent } from "@/shared/a2ui-contract";

type FractionDiagramComponent = Extract<
  A2UIComponent,
  { component: "FractionDiagram" }
>;

// #116 focused slice: a simple bar of equal-sized wholes. The learner sets
// the shaded count by keyboard alone (native arrows on the number input,
// labeled step buttons); selection stays local per the fractions-v2 contract
// and stage changes go through the server-authorized advanceStage action.
export const FractionDiagram = ({
  component,
}: {
  readonly component: FractionDiagramComponent;
}): ReactNode => {
  const { denominator, label } = component;
  const [shaded, setShaded] = useState(component.numerator);
  const [inputValue, setInputValue] = useState(String(component.numerator));
  const [error, setError] = useState<string | null>(null);

  const boundsMessage = `Choose a whole number from 0 to ${denominator}.`;
  const errorId = `a2ui-fraction-error-${component.id}`;
  const parts: number[] = [];
  for (let part = 0; part < denominator; part += 1) {
    parts.push(part);
  }

  const commitValue = (next: number): void => {
    setShaded(next);
    setInputValue(String(next));
    setError(null);
  };

  const handleInput = (raw: string): void => {
    setInputValue(raw);
    const trimmed = raw.trim();
    if (!/^\d+$/u.test(trimmed)) {
      setError(boundsMessage);
      return;
    }
    const parsed = Number(trimmed);
    if (parsed > denominator) {
      setError(boundsMessage);
      return;
    }
    setShaded(parsed);
    setError(null);
  };

  const step = (delta: number): void => {
    const next = shaded + delta;
    if (next < 0 || next > denominator) {
      setError(boundsMessage);
      return;
    }
    commitValue(next);
  };

  return (
    <fieldset className="a2ui-fraction">
      <legend className="sr-only">{label}</legend>
      <div className="a2ui-fraction-bar" aria-hidden="true">
        {parts.map((part) => {
          return (
            <span
              key={part}
              className={cn("a2ui-fraction-bar__part", {
                "is-shaded": part < shaded,
              })}
            />
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {shaded} of {denominator} equal parts shaded.
      </p>
      <div className="a2ui-fraction__controls">
        <button
          className="a2ui-fraction__step"
          type="button"
          aria-label="Clear one shaded part"
          onClick={() => step(-1)}
          disabled={shaded === 0}
        >
          −
        </button>
        <input
          className="a2ui-fraction__value"
          type="number"
          inputMode="numeric"
          min={0}
          max={denominator}
          step={1}
          value={inputValue}
          aria-label={`Parts shaded out of ${denominator}`}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => handleInput(event.target.value)}
        />
        <button
          className="a2ui-fraction__step"
          type="button"
          aria-label="Shade one more part"
          onClick={() => step(1)}
          disabled={shaded === denominator}
        >
          +
        </button>
      </div>
      {error ? (
        <p className="a2ui-fraction__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      <p className="sr-only">
        {component.textEquivalent ??
          `${component.numerator} of ${denominator} equal parts shown in the lesson.`}
      </p>
    </fieldset>
  );
};
