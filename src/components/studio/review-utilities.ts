import type { PublicationFinding } from "@/shared/publication-contract";

export const variantKindLabels = {
  standard: "Core matching",
  scaffold: "Guided support",
  challenge: "Higher demand",
} as const;

export const targetKey = (kind: string, id: string): string => `${kind}:${id}`;

export const warningsForTarget = (
  findings: readonly PublicationFinding[],
  targetKind: "variant" | "reverse-path",
  targetId: string
): PublicationFinding[] => {
  return findings.filter((finding) => {
    if (finding.verdict !== "warning") {
      return false;
    }
    return targetKind === "variant"
      ? !finding.variantId || finding.variantId === targetId
      : !finding.variantId && finding.field === "learningPath";
  });
};

export const areValuesFilled = (values: readonly string[]): boolean =>
  values.every((value) => value.trim().length > 0);
