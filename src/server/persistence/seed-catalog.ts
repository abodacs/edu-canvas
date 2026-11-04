import { builtInStandardsPacks } from "@/server/curriculum/built-in-packs";

import { assertSeedIntegrity, syntheticSeed } from "@/server/seed-data";

import type { StandardsPack } from "@/server/curriculum/standards-pack";
import type { SeedCounts } from "@/server/seed-data";

/**
 * The rows the database seed writes for the `standards` table. They are derived
 * from the standards-pack registry, so a new built-in pack gets a row without a
 * second hand-maintained list. Only the seed tenant is populated; a brand-new
 * real tenant still needs provisioning (#110).
 */
export interface SeededStandardRow {
  id: string;
  code: string;
  name: string;
  subject: string;
  gradeBand: string;
}

const targetNodeLabel = (pack: StandardsPack): string | undefined => {
  return pack.graph.nodes.find((node) => node.id === pack.graph.targetNodeId)
    ?.label;
};

const packStandardName = (pack: StandardsPack): string => {
  const label = targetNodeLabel(pack);
  const withoutStandardSuffix = label?.replace(/\s*\([^)]*\)\s*$/u, "").trim();
  return withoutStandardSuffix || pack.standardCode;
};

const rowForPack = (pack: StandardsPack): SeededStandardRow => {
  if (pack.standardId === syntheticSeed.standard.id) {
    return {
      id: syntheticSeed.standard.id,
      code: syntheticSeed.standard.code,
      name: syntheticSeed.standard.name,
      subject: syntheticSeed.standard.subject,
      gradeBand: syntheticSeed.standard.gradeBand,
    };
  }

  return {
    id: pack.standardId,
    code: pack.standardCode,
    name: packStandardName(pack),
    subject: pack.subject,
    gradeBand: `Grade ${pack.grade}`,
  };
};

export const seededStandardRows: readonly SeededStandardRow[] =
  builtInStandardsPacks.map(rowForPack);

export const getSyntheticSeedCounts = (): SeedCounts => {
  assertSeedIntegrity();

  return {
    tenants: 1,
    identities: syntheticSeed.identities.length,
    standards: seededStandardRows.length,
    graphNodes: syntheticSeed.graphNodes.length,
    graphEdges: syntheticSeed.graphEdges.length,
    activities: 1,
    activityVersions: 1,
    attempts: 1,
  };
};
