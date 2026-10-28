import { useId } from "react";

import type { KeyboardEvent, ReactElement } from "react";

interface MembershipRadioProperties {
  readonly name: string;
  readonly value: string;
  readonly checked: boolean;
  readonly school: string;
  readonly role: string;
  readonly disabled?: boolean;
  readonly onSelect: (value: string) => void;
  readonly onActivateKey: (event: KeyboardEvent<HTMLInputElement>) => void;
}

// One option in a native radio group. Native radios supply a single tab stop,
// roving arrow-key movement, and a label that is part of the hit target — and
// they never expose an internal identifier, only the school and role.
export const MembershipRadio = ({
  name,
  value,
  checked,
  school,
  role,
  disabled = false,
  onSelect,
  onActivateKey,
}: MembershipRadioProperties): ReactElement => {
  const inputId = useId();

  return (
    <label className="membership-option" htmlFor={inputId}>
      <input
        id={inputId}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        aria-label={`${school}, ${role}`}
        onChange={() => {
          onSelect(value);
        }}
        onKeyDown={onActivateKey}
      />
      <span className="membership-option__copy">
        <span className="membership-option__school">{school}</span>
        <span className="membership-option__role">{role}</span>
      </span>
    </label>
  );
};
