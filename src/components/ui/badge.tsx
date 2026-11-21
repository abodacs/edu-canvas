import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

import { cn } from "@/lib/utilities";

type BadgeTone = "ok" | "warn" | "stop" | "idle";

interface BadgeProps extends useRender.ComponentProps<"span"> {
  readonly tone?: BadgeTone;
}

const Badge = ({
  className,
  tone = "idle",
  render,
  ...properties
}: BadgeProps) => {
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
