import postgres from "postgres";
import { z } from "zod";

import {
  PREREQUISITE_RESOLUTIONS,
  STANDARD_GROUNDING_GAP_CODES,
} from "../grounding/standards/types";
import { StandardGroundingUniqueViolationError } from "./standard-grounding-port";

import type { StandardGroundingRecord } from "../grounding/standards/types";
import type { StandardGroundingPersistence } from "./standard-grounding-port";

type SqlClient = ReturnType<typeof postgres>;
type SqlTransaction = postgres.TransactionSql;
type StoredTimestamp = string | Date;

const CLIENT_OPTIONS = {
  max: 1,
  connect_timeout: 5,
  idle_timeout: 5,
  max_lifetime: 30,
  prepare: false,
} as const;

const toIso = (value: StoredTimestamp): string => {
  return value instanceof Date ? value.toISOString() : value;
};

export interface GroundingRow {
  id: string;
  tenant_id: string;
  request_key: string;
  input_hash: string;
  registry_version: string;
  framework_id: string;
  jurisdiction: string;
  statement_code: string;
  subject: string;
  grade: number;
  standard_id: string | null;
  description: string | null;
  description_hash: string | null;
  components: unknown;
  prerequisites: unknown;
  prerequisite_resolution: string;
  gaps: unknown;
  provenance: unknown;
  content_hash: string;
  retrieval_attempt: number;
  retrieved_at: StoredTimestamp;
  predecessor_grounding_id: string | null;
  created_at: StoredTimestamp;
}

const storedComponentSchema = z
  .object({ id: z.string(), text: z.string() })
  .strict();

const storedPrerequisiteSchema = z
  .object({
    statementCode: z.string(),
    jurisdiction: z.string(),
    matchType: z.string(),
    alignmentScore: z.number(),
  })
  .strict();

const storedGapSchema = z
  .object({
    code: z.enum(STANDARD_GROUNDING_GAP_CODES),
    message: z.string(),
  })
  .strict();

const storedProvenanceSchema = z
  .object({
    license: z.string(),
    attribution: z.string(),
    sourceLink: z.string(),
    retrievedAt: z.string(),
  })
  .strict();

const storedPrerequisiteResolutionSchema = z.enum(PREREQUISITE_RESOLUTIONS);

const malformedRow = (): Error => {
  return new Error("A stored standard grounding row is malformed.");
};

/**
 * Decode one persisted row. The JSON columns are provider-derived data, so a
 * corrupt or hand-edited row fails closed instead of being cast into a
 * plausible-looking record. This is exported as the row-decoding seam for the
 * malformed-row test; production calls it from every read path.
 */
export const hydrateStandardGroundingRow = (
  row: GroundingRow
): StandardGroundingRecord => {
  try {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      requestKey: row.request_key,
      inputHash: row.input_hash,
      registryVersion: row.registry_version,
      frameworkId: row.framework_id,
      jurisdiction: row.jurisdiction,
      statementCode: row.statement_code,
      subject: row.subject,
      grade: Number(row.grade),
      standardId: row.standard_id,
      description: row.description,
      descriptionHash: row.description_hash,
      components: z.array(storedComponentSchema).parse(row.components),
      prerequisites: z.array(storedPrerequisiteSchema).parse(row.prerequisites),
      prerequisiteResolution: storedPrerequisiteResolutionSchema.parse(
        row.prerequisite_resolution
      ),
      gaps: z.array(storedGapSchema).parse(row.gaps),
      provenance: storedProvenanceSchema.parse(row.provenance),
      contentHash: row.content_hash,
      retrievalAttempt: Number(row.retrieval_attempt) === 2 ? 2 : 1,
      retrievedAt: toIso(row.retrieved_at),
      predecessorGroundingId: row.predecessor_grounding_id,
      createdAt: toIso(row.created_at),
    };
  } catch {
    throw malformedRow();
  }
};

const setTenant = async (
  transaction: SqlTransaction,
  tenantId: string
): Promise<void> => {
  await transaction`select set_config('app.tenant_id', ${tenantId}, true)`;
};

const constraintOf = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const record = error as Record<string, unknown>;
  if (typeof record.constraint_name === "string") {
    return record.constraint_name;
  }
  return typeof record.constraint === "string" ? record.constraint : undefined;
};

const isUniqueViolation = (error: unknown): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as Record<string, unknown>).code === "23505"
  );
};

export const createPostgresStandardGroundingPersistence = (
  databaseUrl: string
): StandardGroundingPersistence => {
  const withTenantDatabase = async <T>(
    work: (sql: SqlClient) => Promise<T>
  ): Promise<T> => {
    const sql = postgres(databaseUrl, CLIENT_OPTIONS);
    try {
      return await work(sql);
    } finally {
      await sql.end({ timeout: 3 });
    }
  };

  const readRecords = async (
    tenantId: string,
    standard: { readonly jurisdiction: string; readonly statementCode: string }
  ): Promise<StandardGroundingRecord[]> => {
    return await withTenantDatabase(async (sql) => {
      return await sql.begin(async (transaction) => {
        await setTenant(transaction, tenantId);
        const rows = await transaction<GroundingRow[]>`
          select * from standard_groundings
          where tenant_id = ${tenantId}
            and jurisdiction = ${standard.jurisdiction}
            and statement_code = ${standard.statementCode}
          order by created_at desc, id desc
        `;
        return rows.map(hydrateStandardGroundingRow);
      });
    });
  };

  return {
    kind: "postgres",
    check: async () => {
      return await withTenantDatabase(async (sql) => {
        const [row] = await sql`select 1 as ok`;
        return row !== undefined;
      });
    },

    insert: async (record) => {
      try {
        await withTenantDatabase((sql) => {
          return sql.begin(async (transaction) => {
            await setTenant(transaction, record.tenantId);
            await transaction`
              insert into standard_groundings (
                id, tenant_id, request_key, input_hash, registry_version,
                framework_id, jurisdiction, statement_code, subject, grade,
                standard_id, description, description_hash, components,
                prerequisites, prerequisite_resolution, gaps, provenance,
                content_hash, retrieval_attempt, retrieved_at,
                predecessor_grounding_id, created_at
              ) values (
                ${record.id}, ${record.tenantId}, ${record.requestKey},
                ${record.inputHash}, ${record.registryVersion},
                ${record.frameworkId}, ${record.jurisdiction},
                ${record.statementCode}, ${record.subject}, ${record.grade},
                ${record.standardId}, ${record.description},
                ${record.descriptionHash},
                ${transaction.json(record.components as unknown as postgres.JSONValue)}::jsonb,
                ${transaction.json(record.prerequisites as unknown as postgres.JSONValue)}::jsonb,
                ${record.prerequisiteResolution},
                ${transaction.json(record.gaps as unknown as postgres.JSONValue)}::jsonb,
                ${transaction.json(record.provenance as unknown as postgres.JSONValue)}::jsonb,
                ${record.contentHash}, ${record.retrievalAttempt},
                ${record.retrievedAt}, ${record.predecessorGroundingId},
                ${record.createdAt}
              )
            `;
          });
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new StandardGroundingUniqueViolationError(constraintOf(error), {
            cause: error,
          });
        }
        throw error;
      }
    },

    read: async (tenantId, groundingId) => {
      return await withTenantDatabase(async (sql) => {
        return await sql.begin(async (transaction) => {
          await setTenant(transaction, tenantId);
          const rows = await transaction<GroundingRow[]>`
            select * from standard_groundings
            where tenant_id = ${tenantId} and id = ${groundingId}
          `;
          const [row] = rows;
          return row ? hydrateStandardGroundingRow(row) : undefined;
        });
      });
    },

    readByRequestKey: async (tenantId, requestKey) => {
      return await withTenantDatabase(async (sql) => {
        return await sql.begin(async (transaction) => {
          await setTenant(transaction, tenantId);
          const rows = await transaction<GroundingRow[]>`
            select * from standard_groundings
            where tenant_id = ${tenantId} and request_key = ${requestKey}
          `;
          const [row] = rows;
          return row ? hydrateStandardGroundingRow(row) : undefined;
        });
      });
    },

    readLatestForStandard: async (tenantId, standard) => {
      const [latest] = await readRecords(tenantId, standard);
      return latest;
    },

    history: async (tenantId, standard) => {
      return await readRecords(tenantId, standard);
    },
  };
};
