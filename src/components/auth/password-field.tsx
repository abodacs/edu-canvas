import { Eye, EyeOff } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import type { ReactElement } from "react";

interface PasswordFieldProperties {
  readonly label: string;
  readonly name: string;
  readonly value: string;
  readonly autoComplete: "current-password" | "new-password";
  readonly onValueChange: (value: string) => void;
  readonly describedBy?: string;
  readonly invalid?: boolean;
  readonly minLength?: number;
  readonly required?: boolean;
  readonly disabled?: boolean;
}

/**
 * A password input with a visible label and an inline show/hide toggle. The
 * toggle is a real button with `aria-pressed`, so it announces its state and
 * keeps focus where the user left it. Paste and password managers are never
 * blocked: the input keeps a name, an autocomplete token, and no paste guard.
 */
export const PasswordField = ({
  label,
  name,
  value,
  autoComplete,
  onValueChange,
  describedBy,
  invalid = false,
  minLength,
  required = true,
  disabled = false,
}: PasswordFieldProperties): ReactElement => {
  const [isVisible, setIsVisible] = useState(false);
  const inputId = useId();
  const toggle = useRef<HTMLButtonElement>(null);

  const toggleVisibility = (): void => {
    setIsVisible((visible) => !visible);
    toggle.current?.focus();
  };

  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="field__control">
        <input
          id={inputId}
          className="field__input field__input--with-toggle"
          name={name}
          type={isVisible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          aria-label={label}
          aria-invalid={invalid}
          aria-describedby={describedBy}
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
          aria-pressed={isVisible}
          aria-controls={inputId}
          disabled={disabled}
          onClick={toggleVisibility}
        >
          {isVisible ? (
            <EyeOff aria-hidden="true" />
          ) : (
            <Eye aria-hidden="true" />
          )}
          {isVisible ? "Hide" : "Show"}
        </Button>
      </div>
    </div>
  );
};
