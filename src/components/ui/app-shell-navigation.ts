import type { AppShellNavItem } from "@/components/ui/app-shell";

/**
The two teacher destinations, in the order every teacher page shows them. The current one carries `aria-current="page"` from the router.
*/
export const teacherNavigation: readonly AppShellNavItem[] = [
  { to: "/workspace", label: "Lesson studio" },
  { to: "/dashboard", label: "Lesson results" },
];

const initialsLimit = 2;

/**
Up to two initials from a display name, for the decorative avatar only.
*/
export const initialsFor = (displayName: string): string => {
  return displayName
    .split(/\s+/u)
    .filter((part) => part.length > 0)
    .slice(0, initialsLimit)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join("");
};
