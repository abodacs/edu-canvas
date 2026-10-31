export const variantKindLabels = {
  standard: "Core matching",
  scaffold: "Guided support",
  challenge: "Higher demand",
} as const;

export {
  publicationTargetKey as targetKey,
  warningsForTarget,
} from "@/shared/publication-contract";

export const areValuesFilled = (values: readonly string[]): boolean =>
  values.every((value) => value.trim().length > 0);
