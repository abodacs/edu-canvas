const KNOWN_STANDARDS: Readonly<
  Record<string, { readonly code: string; readonly topic: string }>
> = {
  standard_ccss_4_nf_a_01: { code: "4.NF.A.1", topic: "Equivalent fractions" },
};

export const displayStandardCode = (standardId: string): string =>
  KNOWN_STANDARDS[standardId]?.code ?? standardId;

export const displayStandardTopic = (standardId: string): string | null =>
  KNOWN_STANDARDS[standardId]?.topic ?? null;
