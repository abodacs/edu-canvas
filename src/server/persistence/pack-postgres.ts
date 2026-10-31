import postgres from "postgres";

import { PackUniqueViolationError } from "./pack-port";

import type {
  PackApprovalRecord,
  PackAssignmentRecord,
  PackLearner,
  PackPersistence,
  PackPublicationRecord,
  PackReceiptRecord,
  PackVersionRecord,
} from "./pack-port";

type PackRow = Record<string, unknown>;
type SqlClient = ReturnType<typeof postgres>;
type SqlTransaction = postgres.TransactionSql;
type JsonValue = postgres.JSONValue;

const createSqlClient = (databaseUrl: string): SqlClient => {
  return postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 30,
    prepare: false,
  });
};

const jsonValue = (value: unknown): JsonValue => {
  if (value === null) {
    return null;
  }
  switch (typeof value) {
    case "boolean":
    case "string": {
      return value;
    }
    case "number": {
      if (!Number.isFinite(value)) {
        throw new TypeError("Cannot encode a non-finite JSON number.");
      }
      return value;
    }
    case "object": {
      return Array.isArray(value)
        ? value.map(jsonValue)
        : Object.fromEntries(
            Object.entries(value).map(([key, child]) => [key, jsonValue(child)])
          );
    }
    default: {
      throw new Error("Cannot encode a non-JSON persistence value.");
    }
  }
};

const withTenant = async <T>(
  databaseUrl: string,
  tenantId: string,
  work: (transaction: SqlTransaction) => Promise<T>
): Promise<T> => {
  const sql = createSqlClient(databaseUrl);
  try {
    const result = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.tenant_id', ${tenantId}, true)`;
      return work(transaction);
    });
    return result as T;
  } finally {
    await sql.end({ timeout: 3 });
  }
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

const runInsert = async (work: () => Promise<unknown>): Promise<void> => {
  try {
    await work();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new PackUniqueViolationError(constraintOf(error), {
        cause: error,
      });
    }
    throw error;
  }
};

const asString = String;

const toIso = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const asNullableString = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

const asNumber = Number;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : [];

const mapVersion = (row: PackRow): PackVersionRecord => {
  return {
    id: asString(row.id),
    tenantId: asString(row.tenant_id),
    schemaVersion: asString(row.schema_version),
    requestId: asString(row.request_id),
    teacherActorId: asString(row.teacher_actor_id),
    revision: asNumber(row.revision),
    state: asString(row.state),
    parentVersionId: asNullableString(row.parent_version_id),
    sourceArtifactHash: asString(row.source_artifact_hash),
    artifactHash: asString(row.artifact_hash),
    gateVerdict: asString(row.gate_verdict),
    gateSnapshot: row.gate_snapshot ?? null,
    validationResult: row.validation_result,
    validationResultHash: asString(row.validation_result_hash),
    ruleVersions: row.rule_versions,
    provenance: row.provenance,
    publicContent: row.public_content,
    privateAnswers: row.private_answers,
    contentHash: asString(row.content_hash),
    privateAnswerDigest: asString(row.private_answer_digest),
    createdAt: toIso(row.created_at),
  };
};

const mapApproval = (row: PackRow): PackApprovalRecord => {
  return {
    id: asString(row.id),
    tenantId: asString(row.tenant_id),
    schemaVersion: asString(row.schema_version),
    versionId: asString(row.version_id),
    targetKind: asString(row.target_kind),
    targetId: asString(row.target_id),
    approvingActorId: asString(row.approving_actor_id),
    artifactHash: asString(row.artifact_hash),
    validationResultHash: asString(row.validation_result_hash),
    acknowledgedFindingCodes: asStringArray(row.acknowledged_finding_codes),
    createdAt: toIso(row.created_at),
  };
};

const mapPublication = (row: PackRow): PackPublicationRecord => {
  return {
    id: asString(row.id),
    tenantId: asString(row.tenant_id),
    schemaVersion: asString(row.schema_version),
    versionId: asString(row.version_id),
    approvingActorId: asString(row.approving_actor_id),
    artifactHash: asString(row.artifact_hash),
    validationResultHash: asString(row.validation_result_hash),
    contentHash: asString(row.content_hash),
    privateAnswerDigest: asString(row.private_answer_digest),
    ruleVersions: row.rule_versions,
    approvedAt: toIso(row.approved_at),
    createdAt: toIso(row.created_at),
  };
};

const mapAssignment = (row: PackRow): PackAssignmentRecord => {
  return {
    id: asString(row.id),
    tenantId: asString(row.tenant_id),
    schemaVersion: asString(row.schema_version),
    publicationId: asString(row.publication_id),
    learnerId: asString(row.learner_id),
    assigningActorId: asString(row.assigning_actor_id),
    createdAt: toIso(row.created_at),
  };
};

const mapReceipt = (row: PackRow): PackReceiptRecord => {
  return {
    id: asString(row.id),
    tenantId: asString(row.tenant_id),
    schemaVersion: asString(row.schema_version),
    actorId: asString(row.actor_id),
    membershipId: asString(row.membership_id),
    authorizationRevision: asNumber(row.authorization_revision),
    action: asString(row.action),
    operationKey: asString(row.operation_key),
    inputHash: asString(row.input_hash),
    resultKind: asString(row.result_kind),
    resultIds: asStringArray(row.result_ids),
    createdAt: toIso(row.created_at),
  };
};

const mapLearner = (row: PackRow): PackLearner => {
  return {
    id: asString(row.id),
    displayName: asString(row.display_name),
  };
};

export const createPostgresPackPersistence = (
  databaseUrl: string
): PackPersistence => {
  return {
    kind: "postgres",

    check: async () => {
      const sql = createSqlClient(databaseUrl);
      try {
        await sql`select 1 from pack_versions limit 0`;
        return true;
      } catch {
        return false;
      } finally {
        await sql.end({ timeout: 3 });
      }
    },

    listVersions: (tenantId, requestId) => {
      return withTenant(databaseUrl, tenantId, async (transaction) => {
        const rows = await transaction<PackRow[]>`
          select *
          from pack_versions
          where tenant_id = ${tenantId} and request_id = ${requestId}
          order by revision desc
        `;
        return rows.map(mapVersion);
      });
    },

    readLatestVersion: (tenantId, requestId) => {
      return withTenant(databaseUrl, tenantId, async (transaction) => {
        const rows = await transaction<PackRow[]>`
          select *
          from pack_versions
          where tenant_id = ${tenantId} and request_id = ${requestId}
          order by revision desc
          limit 1
        `;
        return rows.length > 0 ? mapVersion(rows[0]) : undefined;
      });
    },

    readVersion: (tenantId, versionId) => {
      return withTenant(databaseUrl, tenantId, async (transaction) => {
        const rows = await transaction<PackRow[]>`
          select *
          from pack_versions
          where tenant_id = ${tenantId} and id = ${versionId}
          limit 1
        `;
        return rows.length > 0 ? mapVersion(rows[0]) : undefined;
      });
    },

    insertVersion: (record) => {
      return withTenant(databaseUrl, record.tenantId, async (transaction) => {
        await runInsert(() => {
          return transaction`
            insert into pack_versions (
              id, tenant_id, schema_version, request_id, teacher_actor_id,
              revision, state, parent_version_id, source_artifact_hash,
              artifact_hash, gate_verdict, gate_snapshot, validation_result,
              validation_result_hash, rule_versions, provenance,
              public_content, private_answers, content_hash,
              private_answer_digest, created_at
            )
            values (
              ${record.id}, ${record.tenantId}, ${record.schemaVersion},
              ${record.requestId}, ${record.teacherActorId}, ${record.revision},
              ${record.state}, ${record.parentVersionId},
              ${record.sourceArtifactHash}, ${record.artifactHash},
              ${record.gateVerdict},
              ${record.gateSnapshot === null ? null : transaction.json(jsonValue(record.gateSnapshot))}::jsonb,
              ${transaction.json(jsonValue(record.validationResult))}::jsonb,
              ${record.validationResultHash},
              ${transaction.json(jsonValue(record.ruleVersions))}::jsonb,
              ${transaction.json(jsonValue(record.provenance))}::jsonb,
              ${transaction.json(jsonValue(record.publicContent))}::jsonb,
              ${transaction.json(jsonValue(record.privateAnswers))}::jsonb,
              ${record.contentHash}, ${record.privateAnswerDigest},
              ${record.createdAt}
            )
          `;
        });
      });
    },

    listApprovals: (tenantId, versionId) => {
      return withTenant(databaseUrl, tenantId, async (transaction) => {
        const rows = await transaction<PackRow[]>`
          select *
          from pack_approvals
          where tenant_id = ${tenantId} and version_id = ${versionId}
          order by created_at asc
        `;
        return rows.map(mapApproval);
      });
    },

    readApproval: (tenantId, versionId, targetKind, targetId) => {
      return withTenant(databaseUrl, tenantId, async (transaction) => {
        const rows = await transaction<PackRow[]>`
          select *
          from pack_approvals
          where tenant_id = ${tenantId}
            and version_id = ${versionId}
            and target_kind = ${targetKind}
            and target_id = ${targetId}
          limit 1
        `;
        return rows.length > 0 ? mapApproval(rows[0]) : undefined;
      });
    },

    insertApproval: (record) => {
      return withTenant(databaseUrl, record.tenantId, async (transaction) => {
        await runInsert(() => {
          return transaction`
            insert into pack_approvals (
              id, tenant_id, schema_version, version_id, target_kind,
              target_id, approving_actor_id, artifact_hash,
              validation_result_hash, acknowledged_finding_codes, created_at
            )
            values (
              ${record.id}, ${record.tenantId}, ${record.schemaVersion},
              ${record.versionId}, ${record.targetKind}, ${record.targetId},
              ${record.approvingActorId}, ${record.artifactHash},
              ${record.validationResultHash},
              ${transaction.json(jsonValue([...record.acknowledgedFindingCodes]))}::jsonb,
              ${record.createdAt}
            )
          `;
        });
      });
    },

    readPublicationForVersion: (tenantId, versionId) => {
      return withTenant(databaseUrl, tenantId, async (transaction) => {
        const rows = await transaction<PackRow[]>`
          select *
          from pack_publications
          where tenant_id = ${tenantId} and version_id = ${versionId}
          limit 1
        `;
        return rows.length > 0 ? mapPublication(rows[0]) : undefined;
      });
    },

    insertPublication: (record) => {
      return withTenant(databaseUrl, record.tenantId, async (transaction) => {
        await runInsert(() => {
          return transaction`
            insert into pack_publications (
              id, tenant_id, schema_version, version_id, approving_actor_id,
              artifact_hash, validation_result_hash, content_hash,
              private_answer_digest, rule_versions, approved_at, created_at
            )
            values (
              ${record.id}, ${record.tenantId}, ${record.schemaVersion},
              ${record.versionId}, ${record.approvingActorId},
              ${record.artifactHash}, ${record.validationResultHash},
              ${record.contentHash}, ${record.privateAnswerDigest},
              ${transaction.json(jsonValue(record.ruleVersions))}::jsonb,
              ${record.approvedAt}, ${record.createdAt}
            )
          `;
        });
      });
    },

    readAssignmentForPublication: (tenantId, publicationId) => {
      return withTenant(databaseUrl, tenantId, async (transaction) => {
        const rows = await transaction<PackRow[]>`
          select *
          from pack_assignments
          where tenant_id = ${tenantId} and publication_id = ${publicationId}
          order by created_at asc
          limit 1
        `;
        return rows.length > 0 ? mapAssignment(rows[0]) : undefined;
      });
    },

    insertAssignment: (record) => {
      return withTenant(databaseUrl, record.tenantId, async (transaction) => {
        await runInsert(() => {
          return transaction`
            insert into pack_assignments (
              id, tenant_id, schema_version, publication_id, learner_id,
              assigning_actor_id, created_at
            )
            values (
              ${record.id}, ${record.tenantId}, ${record.schemaVersion},
              ${record.publicationId}, ${record.learnerId},
              ${record.assigningActorId}, ${record.createdAt}
            )
          `;
        });
      });
    },

    readReceipt: (tenantId, actorId, action, operationKey) => {
      return withTenant(databaseUrl, tenantId, async (transaction) => {
        const rows = await transaction<PackRow[]>`
          select *
          from pack_receipts
          where tenant_id = ${tenantId}
            and actor_id = ${actorId}
            and action = ${action}
            and operation_key = ${operationKey}
          limit 1
        `;
        return rows.length > 0 ? mapReceipt(rows[0]) : undefined;
      });
    },

    insertReceipt: (record) => {
      return withTenant(databaseUrl, record.tenantId, async (transaction) => {
        await runInsert(() => {
          return transaction`
            insert into pack_receipts (
              id, tenant_id, schema_version, actor_id, membership_id,
              authorization_revision, action, operation_key, input_hash,
              result_kind, result_ids, created_at
            )
            values (
              ${record.id}, ${record.tenantId}, ${record.schemaVersion},
              ${record.actorId}, ${record.membershipId},
              ${record.authorizationRevision}, ${record.action},
              ${record.operationKey}, ${record.inputHash},
              ${record.resultKind},
              ${transaction.json(jsonValue([...record.resultIds]))}::jsonb,
              ${record.createdAt}
            )
          `;
        });
      });
    },

    listLearners: (tenantId) => {
      return withTenant(databaseUrl, tenantId, async (transaction) => {
        const rows = await transaction<PackRow[]>`
          select id, display_name
          from identities
          where tenant_id = ${tenantId}
            and role = 'student'
            and is_active = true
          order by display_name asc
        `;
        return rows.map(mapLearner);
      });
    },

    readLearner: (tenantId, learnerId) => {
      return withTenant(databaseUrl, tenantId, async (transaction) => {
        const rows = await transaction<PackRow[]>`
          select id, display_name
          from identities
          where tenant_id = ${tenantId}
            and id = ${learnerId}
            and role = 'student'
            and is_active = true
          limit 1
        `;
        return rows.length > 0 ? mapLearner(rows[0]) : undefined;
      });
    },
  };
};
