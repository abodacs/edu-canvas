import { cloneElement, useId } from "react";

import { cn } from "@/lib/utilities";

import type { ReactElement } from "react";

interface FieldControlProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

interface FieldProps {
  readonly label: string;
  readonly help?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly className?: string;
  readonly children: ReactElement<FieldControlProps>;
}

const joinIds = (ids: readonly (string | undefined)[]): string | undefined => {
  const present = ids.filter(Boolean);
  return present.length > 0 ? present.join(" ") : undefined;
};

const Field = ({
  label,
  help,
  error,
  required = false,
  className,
  children,
}: FieldProps): ReactElement => {
  const generatedId = useId();
  const control = children;

  const controlId = control.props.id ?? `${generatedId}-control`;
  const helpId =
    help !== undefined && help !== "" ? `${controlId}-help` : undefined;
  const errorId =
    error !== undefined && error !== "" ? `${controlId}-error` : undefined;
  const hasError = Boolean(error);

  return (
    <div
      data-slot="field"
      className={cn("field", className)}
      data-invalid={hasError ? "" : undefined}
    >
      <label className="field__label" htmlFor={controlId}>
        {label}
        {required ? (
          <span className="field__required" aria-hidden="true">
            {" *"}
          </span>
        ) : null}
      </label>
      {help !== undefined && help !== "" ? (
        <p className="field__hint" id={helpId}>
          {help}
        </p>
      ) : null}
      {/* eslint-disable-next-line react/no-clone-element -- Field owns the label/description wiring for one native control; cloning is the only way to set its id and ARIA without a render prop every caller must repeat. */}
      {cloneElement(control, {
        id: controlId,
        "aria-describedby": joinIds([
          control.props["aria-describedby"],
          helpId,
          errorId,
        ]),
        "aria-invalid": hasError ? true : control.props["aria-invalid"],
        "aria-required": required ? true : control.props["aria-required"],
      })}
      {error !== undefined && error !== "" ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
};

export { Field };
export type { FieldProps };
