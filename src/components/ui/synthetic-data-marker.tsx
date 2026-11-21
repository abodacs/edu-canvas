import { cn } from "@/lib/utilities";

import type { ReactElement, ReactNode } from "react";

interface SyntheticDataMarkerProps {
  readonly variant?: "inline" | "caption";
  readonly as?: "span" | "p" | "figcaption";
  readonly className?: string;
  readonly children?: ReactNode;
}

export const SyntheticDataMarker = ({
  variant = "inline",
  as: Tag = "span",
  className,
  children = "Synthetic data only.",
}: SyntheticDataMarkerProps): ReactElement => {
  return (
    <Tag
      className={cn("synthetic-marker", className)}
      data-synthetic-marker=""
      data-variant={variant}
    >
      {children}
    </Tag>
  );
};
