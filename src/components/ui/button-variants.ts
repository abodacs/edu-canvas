import { cva } from "class-variance-authority";

// The `.btn` vocabulary names each look once (`.ink`, `.secondary`, `.ghost`,
// `.link`; primary is the bare `.btn`) and each size once (`.sm`, `.lg`,
// `.icon`; md is the bare `.btn`). The look lives in base.css under
// `@layer components`, so a caller's utility class or a slice's own class still
// overrides it without `!important`.
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
