import { builtInStandardsPacks } from "@/server/curriculum/built-in-packs";

import { assertSeedIntegrity, syntheticSeed } from "@/server/seed-data";

import type postgres from "postgres";
import type { StandardsPack } from "@/server/curriculum/standards-pack";
import type { SeedCounts } from "@/server/seed-data";

/**
 * The rows the database seed writes for the `standards` table. They are derived
 * from the standards-pack registry, so a new built-in pack gets a row without a
 * second hand-maintained list. The seed and tenant provisioning share this
 * derivation; provisioning writes the same rows for every new tenant (#225).
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

/**
 * One insert path for every tenant that receives the built-in catalogue. The
 * seed re-syncs its row values (`do update`); tenant provisioning stays
 * insert-if-missing so a tenant-local row is never rebranded (#225).
 */
const insertStandardRows = async (
  transaction: postgres.TransactionSql,
  tenantId: string,
  mode: "insert-if-missing" | "sync"
): Promise<void> => {
  await Promise.all(
    seededStandardRows.map((standard) => {
      if (mode === "sync") {
        return transaction`
          insert into standards (id, tenant_id, code, name, subject, grade_band)
          values (
            ${standard.id},
            ${tenantId},
            ${standard.code},
            ${standard.name},
            ${standard.subject},
            ${standard.gradeBand}
          )
          on conflict (tenant_id, id) do update set
            code = excluded.code,
            name = excluded.name,
            subject = excluded.subject,
            grade_band = excluded.grade_band
        `;
      }

      return transaction`
        insert into standards (id, tenant_id, code, name, subject, grade_band)
        values (
          ${standard.id},
          ${tenantId},
          ${standard.code},
          ${standard.name},
          ${standard.subject},
          ${standard.gradeBand}
        )
        on conflict (tenant_id, id) do nothing
      `;
    })
  );
};

export const syncSeededStandardRows = (
  transaction: postgres.TransactionSql,
  tenantId: string
): Promise<void> => {
  return insertStandardRows(transaction, tenantId, "sync");
};

/**
 * Give a newly created tenant one `standards` row per built-in pack, inside
 * the transaction that created it. Replay is insert-if-missing: an existing
 * row keeps whatever the tenant stored.
 */
export const provisionTenantStandards = (
  transaction: postgres.TransactionSql,
  tenantId: string
): Promise<void> => {
  return insertStandardRows(transaction, tenantId, "insert-if-missing");
};

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
