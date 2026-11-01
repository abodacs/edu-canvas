/**
Teacher-facing names for curriculum standard ids. The generation allowlist
ADMITS only the pins in this table today; unknown ids fall back to their raw
form and stay out of the metadata line visible by default (#168 P1-2).
*/
const KNOWN_STANDARD_CODES: Readonly<Record<string, string>> = {
  standard_ccss_4_nf_a_01: "4.NF.A.1",
};

export const displayStandardCode = (standardId: string): string =>
  KNOWN_STANDARD_CODES[standardId] ?? standardId;
