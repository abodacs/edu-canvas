import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

import { cn } from "@/lib/utilities";

type BadgeTone = "ok" | "warn" | "stop" | "idle";

interface BadgeProps extends useRender.ComponentProps<"span"> {
  readonly tone?: BadgeTone;
}

/**
A status pill. The text carries the meaning; the tone only reinforces it, so
colour is never the only signal.
*/
const Badge = ({
  className,
  tone = "idle",
  render,
  ...properties
}: BadgeProps) => {
  // A named object, not a literal, so the data attribute passes the excess
  // property check that only applies to fresh object literals.
  const ownProperties = { className: cn("pill", className), "data-tone": tone };
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(ownProperties, properties),
    render,
    state: { slot: "badge", tone },
  });
};

export { Badge };
export type { BadgeProps, BadgeTone };
