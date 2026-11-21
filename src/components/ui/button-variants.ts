import { cva } from "class-variance-authority";

const buttonVariants = cva("btn", {
  variants: {
    variant: {
      primary: "",
      ink: "ink",
      secondary: "secondary",
      ghost: "ghost",
      link: "link",
      /** @deprecated Use `primary`; removed after the slices migrate. */
      default: "",
      /** @deprecated Use `secondary`; removed after the slices migrate. */
      outline: "secondary",
    },
    size: {
      sm: "sm",
      md: "",
      lg: "lg",
      icon: "icon",
      /** @deprecated Use `md`; removed after the slices migrate. */
      default: "",
      /** @deprecated Use `sm`; removed after the slices migrate. */
      xs: "sm",
      /** @deprecated Use `icon`; removed after the slices migrate. */
      "icon-xs": "icon sm",
      /** @deprecated Use `icon`; removed after the slices migrate. */
      "icon-sm": "icon sm",
      /** @deprecated Use `icon`; removed after the slices migrate. */
      "icon-lg": "icon",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

export { buttonVariants };
