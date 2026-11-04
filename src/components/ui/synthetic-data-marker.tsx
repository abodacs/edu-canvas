import { cn } from "@/lib/utilities";

import type { ReactElement, ReactNode } from "react";

interface SyntheticDataMarkerProps {
  readonly variant?: "inline" | "caption";
  readonly as?: "span" | "p" | "figcaption";
  readonly className?: string;
  readonly children?: ReactNode;
}

/**
The visible notice that every record on screen is synthetic. Copies differ by place (the landing footer credits the provider, the illustration caption names the seed), so the sentence and the element are the caller's; the marker owns only the hook every surface shares.
*/
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
