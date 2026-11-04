import { cn } from "@/lib/utilities";

import type { ComponentProps, ElementType, ReactElement } from "react";

interface CardProps extends ComponentProps<"div"> {
  readonly variant?: "default" | "lift";
  /** The rendered element; a card is a container, so it carries no role. */
  readonly as?: ElementType;
}

const Card = ({
  className,
  variant = "default",
  as: Element = "div",
  ...properties
}: CardProps): ReactElement => {
  return (
    <Element
      data-slot="card"
      className={cn("card", variant === "lift" && "lift", className)}
      {...properties}
    />
  );
};

export { Card };
export type { CardProps };
