import { Eye, EyeOff } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

import type { ReactElement, ReactNode, Ref } from "react";

interface PasswordControlProperties {
  readonly id?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: boolean;
  readonly "aria-required"?: boolean;
  readonly name: string;
  readonly value: string;
  readonly autoComplete: "current-password" | "new-password";
  readonly minLength?: number;
  readonly required: boolean;
  readonly disabled: boolean;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly onValueChange: (value: string) => void;
}

/**
The input plus its reveal toggle. `Field` clones this element and passes the
id and ARIA wiring down, so the label, help and error ids reach the real input
while the toggle stays inside the control row.
*/
const PasswordControl = ({
  id,
  "aria-describedby": describedBy,
  "aria-invalid": isInvalid,
  "aria-required": isRequired,
  name,
  value,
  autoComplete,
  minLength,
  required,
  disabled,
  inputRef,
  onValueChange,
}: PasswordControlProperties): ReactElement => {
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-password`;
  const [isVisible, setIsVisible] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  const toggleVisibility = (): void => {
    setIsVisible((visible) => !visible);
    toggle.current?.focus();
  };

  return (
    <span className="password-control">
      <input
        id={inputId}
        ref={inputRef}
        className="field__input password-control__input"
        name={name}
        type={isVisible ? "text" : "password"}
        value={value}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
        aria-invalid={isInvalid}
        aria-required={isRequired}
        minLength={minLength}
        required={required}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => {
          onValueChange(event.target.value);
        }}
      />
      <Button
        ref={toggle}
        type="button"
        variant="ghost"
        size="sm"
        className="password-toggle"
        aria-label={isVisible ? "Hide password" : "Show password"}
        aria-pressed={isVisible}
        aria-controls={inputId}
        disabled={disabled}
        onClick={toggleVisibility}
      >
        {isVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        {isVisible ? "Hide" : "Show"}
      </Button>
    </span>
  );
};

interface PasswordFieldProperties {
  readonly label: string;
  readonly name: string;
  readonly value: string;
  readonly autoComplete: "current-password" | "new-password";
  readonly onValueChange: (value: string) => void;
  readonly help?: string;
  readonly error?: string | null;
  readonly minLength?: number;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly inputRef?: Ref<HTMLInputElement>;
  /** A field-level action, such as "Forgot password?". */
  readonly action?: ReactNode;
}

/**
 * A password field on the shared `Field` primitive: one label, one control,
 * an optional help line and an error that marks the input invalid. The
 * reveal toggle is a real button with `aria-pressed`, so paste and password
 * managers keep working and the input never loses its name.
 */
export const PasswordField = ({
  label,
  name,
  value,
  autoComplete,
  onValueChange,
  help,
  error,
  minLength,
  required = true,
  disabled = false,
  inputRef,
  action,
}: PasswordFieldProperties): ReactElement => {
  return (
    <div className="password-field">
      <Field label={label} help={help} error={error ?? undefined}>
        <PasswordControl
          name={name}
          value={value}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          disabled={disabled}
          inputRef={inputRef}
          onValueChange={onValueChange}
        />
      </Field>
      {action ? <div className="password-field__action">{action}</div> : null}
    </div>
  );
};
export type { PasswordFieldProperties };
