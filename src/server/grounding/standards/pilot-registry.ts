import type { StandardGroundingGap, StandardGroundingGapCode } from "./types";

/**
The versioned pilot registry (#218). A standard is data, never a code branch:
adding a supported `{jurisdiction, statementCode}` row is an entry here, and the
resolution pipeline reads the same fields for every row.

The eight pilot rows are Multi-State and California crossed with 4.NF.A.1,
4.NF.A.2, 3.NF.A.3 and 4.OA.A.3. Boundary entries pin the recorded absence,
envelope and non-math progression cases.
*/

export const PILOT_REGISTRY_VERSION = "pilot-registry-v1";

export type RegistryEntryKind = "pilot" | "boundary";

export interface RegistryProvenance {
  readonly license: string;
  readonly attribution: string;
  readonly sourceLink: string;
}

export interface StandardRegistryEntry {
  readonly id: string;
  readonly kind: RegistryEntryKind;
  readonly jurisdiction: string;
  readonly statementCode: string;
  readonly subject: string;
  readonly grade: number;
  readonly frameworkId: string;
  readonly prerequisiteResolution: "direct" | "crosswalk";
  readonly provenance: RegistryProvenance;
}

export interface RegistryEnvelope {
  readonly jurisdiction: string;
  readonly subject: string;
  readonly grades: readonly number[];
}

export interface PilotStandardRegistry {
  readonly version: string;
  readonly envelopes: readonly RegistryEnvelope[];
  readonly entries: readonly StandardRegistryEntry[];
}

export const LEARNING_COMMONS_PROVENANCE: RegistryProvenance = {
  license: "CC BY 4.0",
  attribution: "Learning Commons Knowledge Graph",
  sourceLink: "https://www.learningcommons.org/",
};

const pilotRow = (
  jurisdiction: string,
  statementCode: string,
  grade: number,
  frameworkId: string,
  prerequisiteResolution: "direct" | "crosswalk"
): StandardRegistryEntry => {
  return {
    id: `${jurisdiction.toLowerCase()}-${statementCode}`,
    kind: "pilot",
    jurisdiction,
    statementCode,
    subject: "Mathematics",
    grade,
    frameworkId,
    prerequisiteResolution,
    provenance: LEARNING_COMMONS_PROVENANCE,
  };
};

export const PILOT_STANDARD_REGISTRY: PilotStandardRegistry = {
  version: PILOT_REGISTRY_VERSION,
  envelopes: [
    {
      jurisdiction: "Multi-State",
      subject: "Mathematics",
      grades: [3, 4],
    },
    {
      jurisdiction: "California",
      subject: "Mathematics",
      grades: [3, 4],
    },
    {
      jurisdiction: "Multi-State",
      subject: "English Language Arts",
      grades: [5],
    },
  ],
  entries: [
    pilotRow("Multi-State", "4.NF.A.1", 4, "ccss-math", "direct"),
    pilotRow("Multi-State", "4.NF.A.2", 4, "ccss-math", "direct"),
    pilotRow("Multi-State", "3.NF.A.3", 3, "ccss-math", "direct"),
    pilotRow("Multi-State", "4.OA.A.3", 4, "ccss-math", "direct"),
    pilotRow("California", "4.NF.A.1", 4, "ca-ccss-math", "crosswalk"),
    pilotRow("California", "4.NF.A.2", 4, "ca-ccss-math", "crosswalk"),
    pilotRow("California", "3.NF.A.3", 3, "ca-ccss-math", "crosswalk"),
    pilotRow("California", "4.OA.A.3", 4, "ca-ccss-math", "crosswalk"),
    {
      id: "multi-state-RI.5.2",
      kind: "boundary",
      jurisdiction: "Multi-State",
      statementCode: "RI.5.2",
      subject: "English Language Arts",
      grade: 5,
      frameworkId: "ccss-ela",
      prerequisiteResolution: "direct",
      provenance: LEARNING_COMMONS_PROVENANCE,
    },
  ],
};

export type RegistryLookup =
  | { readonly ok: true; readonly entry: StandardRegistryEntry }
  | { readonly ok: false; readonly gap: StandardGroundingGap };

const gap = (
  code: StandardGroundingGapCode,
  message: string
): StandardGroundingGap => {
  return { code, message };
};

/**
 * The grade a statement code names. A math code leads with it (`4.NF.A.1`); an
 * ELA code puts it after the domain letters (`RI.5.2`). The first
 * dot-delimited numeric segment is the grade in both shapes.
 */
export const gradeFromStatementCode = (statementCode: string): number => {
  const match = /(?:^|[^\d])(?<grade>\d+)(?=\.)/u.exec(statementCode);
  return match?.groups?.grade === undefined
    ? Number.NaN
    : Math.trunc(Number(match.groups.grade));
};


const envelopeContains = (
  registry: PilotStandardRegistry,
  jurisdiction: string,
  grade: number
): boolean => {
  if (Number.isNaN(grade)) {
    return false;
  }
  return registry.envelopes.some((envelope) => {
    return (
      envelope.jurisdiction === jurisdiction && envelope.grades.includes(grade)
    );
  });
};

/**
A lookup never guesses. A jurisdiction or grade outside the registered envelope
is `unsupported-envelope`; a supported envelope with no matching entry is
`standard-absent`.
*/
export const findRegistryEntry = (
  registry: PilotStandardRegistry,
  input: { readonly jurisdiction: string; readonly statementCode: string }
): RegistryLookup => {
  const entry = registry.entries.find((candidate) => {
    return (
      candidate.jurisdiction === input.jurisdiction &&
      candidate.statementCode === input.statementCode
    );
  });
  if (entry) {
    return { ok: true, entry };
  }

  const grade = gradeFromStatementCode(input.statementCode);
  if (!envelopeContains(registry, input.jurisdiction, grade)) {
    return {
      ok: false,
      gap: gap(
        "unsupported-envelope",
        "This jurisdiction and grade are outside the supported pilot envelope."
      ),
    };
  }

  return {
    ok: false,
    gap: gap(
      "standard-absent",
      "The provider has no standard with this code in the supported envelope."
    ),
  };
};
