import { createContext, use, useId, useMemo } from "react";

import type { ReactElement, ReactNode } from "react";

type ChipGroupProps =
  | {
      readonly mode: "radio";
      readonly legend: string;
      readonly name?: string;
      readonly value: string;
      readonly onValueChange: (value: string) => void;
      readonly children: ReactNode;
    }
  | {
      readonly mode: "toggle";
      readonly legend: string;
      readonly children: ReactNode;
    };

interface ChipProps {
  readonly value: string;
  /** Toggle mode only. */
  readonly pressed?: boolean;
  /** Toggle mode only: called with the next pressed state. */
  readonly onPressedChange?: (pressed: boolean) => void;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}

type ChipGroupContextValue =
  | {
      readonly mode: "radio";
      readonly name: string;
      readonly value: string;
      readonly onValueChange: (value: string) => void;
    }
  | { readonly mode: "toggle" };

const ChipGroupContext = createContext<ChipGroupContextValue | null>(null);

/**
A labelled group of chips. Radio mode is a fieldset of native radios that share
one name (a `useId` fallback, so two groups never share it); toggle mode is a
fieldset of `aria-pressed` buttons. A chip reads the mode from context and never
sets its own role.
*/
const ChipGroup = (properties: ChipGroupProps): ReactElement => {
  const fallbackName = useId();
  const radioName = properties.mode === "radio" ? properties.name : undefined;
  const radioValue = properties.mode === "radio" ? properties.value : undefined;
  const onValueChange =
    properties.mode === "radio" ? properties.onValueChange : undefined;
  const context = useMemo<ChipGroupContextValue>(
    () =>
      radioValue === undefined || onValueChange === undefined
        ? { mode: "toggle" }
        : {
            mode: "radio",
            name: radioName ?? fallbackName,
            value: radioValue,
            onValueChange,
          },
    [fallbackName, onValueChange, radioName, radioValue]
  );

  return (
    <fieldset className="chips" data-mode={properties.mode}>
      <legend className="chips__legend">{properties.legend}</legend>
      <ChipGroupContext value={context}>{properties.children}</ChipGroupContext>
    </fieldset>
  );
};

const Chip = ({
  value,
  pressed = false,
  onPressedChange,
  disabled = false,
  children,
}: ChipProps): ReactElement => {
  const context = use(ChipGroupContext);
  if (!context) {
    throw new Error("Chip must be rendered inside a ChipGroup.");
  }

  if (context.mode === "toggle") {
    return (
      <button
        type="button"
        className="chip"
        aria-pressed={pressed}
        data-pressed={pressed ? "" : undefined}
        disabled={disabled}
        onClick={() => onPressedChange?.(!pressed)}
      >
        {children}
      </button>
    );
  }

  const checked = context.value === value;
  return (
    <label className="chip" data-checked={checked ? "" : undefined}>
      <input
        type="radio"
        className="chip__input"
        name={context.name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => context.onValueChange(value)}
      />
      <span>{children}</span>
    </label>
  );
};

export { Chip, ChipGroup };
export type { ChipGroupProps, ChipProps };
