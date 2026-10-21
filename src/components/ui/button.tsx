import { Button as ButtonPrimitive } from "@base-ui/react/button";

import { cn } from "@/lib/utilities";

import { buttonVariants } from "./button-variants";
import type { VariantProps } from "class-variance-authority";

const Button = ({
  className,
  variant = "default",
  size = "default",
  ...properties
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) => {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...properties}
    />
  );
};

export { Button };
