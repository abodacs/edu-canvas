import { cva } from "class-variance-authority";

// The `.btn` vocabulary names each look once (`.ink`, `.secondary`, `.ghost`,
// `.link`; primary is the bare `.btn`). The utility classes keep today's look
// until the styling pass moves it into base.css without changing a prop.
const primaryClasses = "bg-primary text-primary-foreground hover:bg-primary/80";
const secondaryClasses =
  "secondary border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50";
const mediumClasses =
  "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2";

const buttonVariants = cva(
  "btn group/button focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 outline-none select-none focus-visible:ring-3 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:ring-3 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: primaryClasses,
        ink: "ink bg-foreground text-background hover:bg-foreground/85",
        secondary: secondaryClasses,
        ghost:
          "ghost hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        link: "link text-primary underline-offset-4 hover:underline",
        /** @deprecated Use `primary`; removed after the slices migrate. */
        default: primaryClasses,
        /** @deprecated Use `secondary`; removed after the slices migrate. */
        outline: secondaryClasses,
      },
      size: {
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        md: mediumClasses,
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2",
        icon: "size-8",
        /** @deprecated Use `md`; removed after the slices migrate. */
        default: mediumClasses,
        /** @deprecated Removed after the slices migrate. */
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3",
        /** @deprecated Removed after the slices migrate. */
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        /** @deprecated Removed after the slices migrate. */
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        /** @deprecated Removed after the slices migrate. */
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export { buttonVariants };
