/**
Teacher-facing names for curriculum standard ids. The generation allowlist
ADMITS only the pins in this table today; unknown ids fall back to their raw
form and stay out of the metadata line visible by default (#168 P1-2).
*/
const KNOWN_STANDARDS: Readonly<
  Record<string, { readonly code: string; readonly topic: string }>
> = {
  standard_ccss_4_nf_a_01: { code: "4.NF.A.1", topic: "Equivalent fractions" },
};

export const displayStandardCode = (standardId: string): string =>
  KNOWN_STANDARDS[standardId]?.code ?? standardId;

/** The plain-language topic a teacher reads as the page name; null if unknown. */
export const displayStandardTopic = (standardId: string): string | null =>
  KNOWN_STANDARDS[standardId]?.topic ?? null;
