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
  const relevant = findings.filter((finding) => {
    if (finding.verdict !== "warning") {
      return false;
    }
    return targetKind === "variant"
      ? !finding.variantId || finding.variantId === targetId
      : !finding.variantId && finding.field === "learningPath";
  });
  const seen = new Set<string>();
  return relevant.filter((finding) => {
    if (seen.has(finding.code)) {
      return false;
    }
    seen.add(finding.code);
    return true;
  });
};

export const areValuesFilled = (values: readonly string[]): boolean =>
  values.every((value) => value.trim().length > 0);
