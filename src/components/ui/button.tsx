import { Button as ButtonPrimitive } from "@base-ui/react/button";

import { cn } from "@/lib/utilities";

import { buttonVariants } from "./button-variants";
import type { ReactElement, ReactNode } from "react";

type ButtonVariant = "primary" | "ink" | "secondary" | "ghost" | "link";
type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends Omit<ButtonPrimitive.Props, "children"> {
  readonly variant?: ButtonVariant | "default" | "outline";
  readonly size?:
    ButtonSize | "default" | "xs" | "icon-sm" | "icon-xs" | "icon-lg";
  readonly busy?: boolean;
  readonly children?: ReactNode;
}

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
