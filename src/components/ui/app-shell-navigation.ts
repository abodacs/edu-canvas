import type { AppShellNavItem } from "@/components/ui/app-shell";

export const teacherNavigation: readonly AppShellNavItem[] = [
  { to: "/workspace", label: "Lesson studio" },
  { to: "/dashboard", label: "Lesson results" },
];

const initialsLimit = 2;

export const initialsFor = (displayName: string): string => {
  return displayName
    .split(/\s+/u)
    .filter((part) => part.length > 0)
    .slice(0, initialsLimit)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join("");
};
