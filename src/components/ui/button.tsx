import { Button as ButtonPrimitive } from "@base-ui/react/button";

import { cn } from "@/lib/utilities";

import { buttonVariants } from "./button-variants";
import type { ReactElement, ReactNode } from "react";

type ButtonVariant = "primary" | "ink" | "secondary" | "ghost" | "link";
type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends Omit<ButtonPrimitive.Props, "children"> {
  /** `default` and `outline` are deprecated aliases for `primary` and `secondary`, kept until the slices migrate. */
  readonly variant?: ButtonVariant | "default" | "outline";
  /** `default` aliases `md`; the other extra sizes are deprecated. */
  readonly size?:
    ButtonSize | "default" | "xs" | "icon-sm" | "icon-xs" | "icon-lg";
  /** Sets aria-busy and data-busy. Keeps the control focusable; callers guard re-entry. */
  readonly busy?: boolean;
  readonly children?: ReactNode;
}

/**
The one button. `busy` keeps the label mounted (so the width holds) and draws a
spinner over it; it never sets `disabled`, because a busy control must stay
focusable. `aria-disabled` is the focusable disabled form, `disabled` the
native one.
*/
const Button = ({
  className,
  variant = "primary",
  size = "md",
  busy = false,
  children,
  ...properties
}: ButtonProps): ReactElement => {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-busy={busy ? "" : undefined}
      aria-busy={busy ? true : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...properties}
    >
      <span className="btn__label">{children}</span>
      {busy ? <span className="btn__spinner" aria-hidden="true" /> : null}
    </ButtonPrimitive>
  );
};

export { Button };
export type { ButtonProps, ButtonSize, ButtonVariant };
