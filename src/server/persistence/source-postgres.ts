import postgres from "postgres";

import type {
  SourceFailureReason,
  SourceFileFormat,
  SourceGap,
  SourceSnapshotState,
} from "@/shared/source-contract";
import type {
  SourcePersistence,
  SourceSnapshotRecord,
} from "../grounding/types";

type SqlClient = ReturnType<typeof postgres>;
type StoredTimestamp = string | Date;
type SqlTransaction = postgres.TransactionSql;

interface SourceSnapshotRow {
  id: string;
  tenant_id: string;
  teacher_id: string;
  standard_id: string;
  mode: string;
  file_name: string;
  file_format: string;
  file_size_bytes: number;
  page_count: number | null;
  content_hash: string | null;
  extracted_text: string | null;
  state: string;
  gaps: unknown;
  failure_reason: string | null;
  unverified_alignment: boolean;
  alignment_acknowledged_at: StoredTimestamp | null;
  synthetic_material_confirmed: boolean;
  required_skills_confirmed_at: StoredTimestamp | null;
  reviewed_at: StoredTimestamp | null;
  used_at: StoredTimestamp | null;
  expires_at: StoredTimestamp;
  replaces_snapshot_id: string | null;
  created_at: StoredTimestamp;
  updated_at: StoredTimestamp;
}

const toIso = (value: StoredTimestamp): string =>
  value instanceof Date ? value.toISOString() : value;

const toIsoOrNull = (value: StoredTimestamp | null): string | null =>
  value === null ? null : toIso(value);

const hydrateSnapshot = (row: SourceSnapshotRow): SourceSnapshotRecord => {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    teacherId: row.teacher_id,
    standardId: row.standard_id,
    mode: "upload",
    fileName: row.file_name,
    fileFormat: row.file_format as SourceFileFormat,
    fileSizeBytes: Number(row.file_size_bytes),
    pageCount: row.page_count,
    contentHash: row.content_hash,
    extractedText: row.extracted_text,
    state: row.state as SourceSnapshotState,
    gaps: Array.isArray(row.gaps) ? (row.gaps as SourceGap[]) : [],
    failureReason: row.failure_reason as SourceFailureReason | null,
    unverifiedAlignment: row.unverified_alignment,
    alignmentAcknowledgedAt: toIsoOrNull(row.alignment_acknowledged_at),
    syntheticMaterialConfirmed: row.synthetic_material_confirmed,
    requiredSkillsConfirmedAt: toIsoOrNull(row.required_skills_confirmed_at),
    reviewedAt: toIsoOrNull(row.reviewed_at),
    usedAt: toIsoOrNull(row.used_at),
    expiresAt: toIso(row.expires_at),
    replacesSnapshotId: row.replaces_snapshot_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
};

const setTenant = async (
  transaction: SqlTransaction,
  tenantId: string
): Promise<void> => {
  await transaction`select set_config('app.tenant_id', ${tenantId}, true)`;
};

const CLIENT_OPTIONS = {
  max: 1,
  connect_timeout: 5,
  idle_timeout: 5,
  max_lifetime: 30,
  prepare: false,
} as const;

export const createPostgresSourcePersistence = (
  databaseUrl: string
): SourcePersistence => {
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

  return {
    async insertSnapshot(record): Promise<void> {
      await withTenantDatabase((sql) => {
        return sql.begin(async (transaction) => {
          await setTenant(transaction, record.tenantId);
          await transaction`
            insert into source_snapshots (
              id, tenant_id, teacher_id, standard_id, mode,
              file_name, file_format, file_size_bytes, page_count,
              content_hash, extracted_text, state, gaps, failure_reason,
              unverified_alignment, alignment_acknowledged_at,
              synthetic_material_confirmed, required_skills_confirmed_at,
              reviewed_at, used_at, expires_at, replaces_snapshot_id,
              created_at, updated_at
            ) values (
              ${record.id}, ${record.tenantId}, ${record.teacherId},
              ${record.standardId}, ${record.mode}, ${record.fileName},
              ${record.fileFormat}, ${record.fileSizeBytes}, ${record.pageCount},
              ${record.contentHash}, ${record.extractedText}, ${record.state},
              ${transaction.json(record.gaps)}::jsonb, ${record.failureReason},
              ${record.unverifiedAlignment}, ${record.alignmentAcknowledgedAt},
              ${record.syntheticMaterialConfirmed}, ${record.requiredSkillsConfirmedAt},
              ${record.reviewedAt}, ${record.usedAt}, ${record.expiresAt},
              ${record.replacesSnapshotId}, ${record.createdAt}, ${record.updatedAt}
            )
          `;
        });
      });
    },

    updateSnapshot: async (record, expectedUpdatedAt): Promise<boolean> => {
      return await withTenantDatabase((sql) => {
        return sql.begin(async (transaction) => {
          await setTenant(transaction, record.tenantId);
          const rows = await transaction<{ id: string }[]>`
            update source_snapshots set
              state = ${record.state},
              gaps = ${transaction.json(record.gaps)}::jsonb,
              failure_reason = ${record.failureReason},
              page_count = ${record.pageCount},
              content_hash = ${record.contentHash},
              extracted_text = ${record.extractedText},
              alignment_acknowledged_at = ${record.alignmentAcknowledgedAt},
              required_skills_confirmed_at = ${record.requiredSkillsConfirmedAt},
              reviewed_at = ${record.reviewedAt},
              used_at = ${record.usedAt},
              expires_at = ${record.expiresAt},
              updated_at = ${record.updatedAt}
            where tenant_id = ${record.tenantId}
              and teacher_id = ${record.teacherId}
              and id = ${record.id}
              and updated_at = ${expectedUpdatedAt}
            returning id
          `;
          return rows.length === 1;
        });
      });
    },

    readSnapshot: async (tenantId, teacherId, snapshotId) => {
      return await withTenantDatabase((sql) => {
        return sql.begin(async (transaction) => {
          await setTenant(transaction, tenantId);
          const rows = await transaction<SourceSnapshotRow[]>`
            select *
            from source_snapshots
            where tenant_id = ${tenantId}
              and teacher_id = ${teacherId}
              and id = ${snapshotId}
            limit 1
          `;
          return rows.length === 0 ? undefined : hydrateSnapshot(rows[0]);
        });
      });
    },

    listSnapshots: async (tenantId, teacherId) => {
      return await withTenantDatabase((sql) => {
        return sql.begin(async (transaction) => {
          await setTenant(transaction, tenantId);
          const rows = await transaction<SourceSnapshotRow[]>`
            select *
            from source_snapshots
            where tenant_id = ${tenantId}
              and teacher_id = ${teacherId}
            order by created_at desc
          `;
          return rows.map(hydrateSnapshot);
        });
      });
    },

    deleteSnapshot: async (
      tenantId,
      teacherId,
      snapshotId
    ): Promise<boolean> => {
      return await withTenantDatabase((sql) => {
        return sql.begin(async (transaction) => {
          await setTenant(transaction, tenantId);
          const rows = await transaction<{ id: string }[]>`
            delete from source_snapshots
            where tenant_id = ${tenantId}
              and teacher_id = ${teacherId}
              and id = ${snapshotId}
            returning id
          `;
          return rows.length === 1;
        });
      });
    },

    expireSnapshotsBefore: async (nowIso): Promise<number> => {
      // The sweep runs as the table owner (RLS ENABLE, not FORCE) with no
      // tenant context until #100 lands the least-privilege role split.
      return await withTenantDatabase(async (sql) => {
        const rows = await sql<{ id: string }[]>`
          delete from source_snapshots
          where expires_at < ${nowIso}
          returning id
        `;
        return rows.length;
      });
    },

    failStaleExtractingSnapshots: async (
      staleBeforeIso,
      nowIso
    ): Promise<number> => {
      return await withTenantDatabase(async (sql) => {
        const rows = await sql<{ id: string }[]>`
          update source_snapshots set
            state = 'failed',
            failure_reason = 'interrupted',
            extracted_text = null,
            updated_at = ${nowIso}
          where state = 'extracting'
            and updated_at < ${staleBeforeIso}
          returning id
        `;
        return rows.length;
      });
    },

    markSnapshotUsed: async (
      tenantId,
      teacherId,
      snapshotId,
      usedAtIso,
      expiresAtIso
    ) => {
      return await withTenantDatabase((sql) => {
        return sql.begin(async (transaction) => {
          await setTenant(transaction, tenantId);
          const rows = await transaction<{ id: string }[]>`
            update source_snapshots set
              used_at = ${usedAtIso},
              expires_at = ${expiresAtIso},
              updated_at = ${usedAtIso}
            where tenant_id = ${tenantId}
              and teacher_id = ${teacherId}
              and id = ${snapshotId}
              and used_at is null
            returning id
          `;
          return rows.length === 1;
        });
      });
    },
  };
};
