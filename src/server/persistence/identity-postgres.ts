import postgres from "postgres";

import { createId } from "../ids";
import { IdentityError } from "../identity/errors";
import {
  parseActorId,
  parseClassId,
  parseLearnerId,
  parseMembershipId,
  parseTenantId,
} from "../identity/identifiers";
import { serverObservability } from "../observability.server";
import type { ServerObservability } from "../observability.server";
import type { ActorId, ClassId, TenantId } from "../identity/identifiers";
import type {
  ActorRecord,
  IdentityPersistence,
  NewActorInput,
  NewClassAssignmentInput,
  NewMembershipInput,
  NewSessionInput,
  ProvisioningAuditEntry,
} from "../identity/persistence-port";
import type {
  IdentityRole,
  IdentitySessionRecord,
  MembershipRecord,
  PendingAuthenticationRecord,
  PendingMembershipOption,
  ProviderBindingRecord,
} from "../identity/types";

type SqlClient = ReturnType<typeof postgres>;
type SqlTransaction = postgres.TransactionSql;
type JsonValue = postgres.JSONValue;

export interface PostgresIdentityPersistenceOptions {
  readonly observability?: ServerObservability;
}

interface ActorRow {
  id: string;
  display_name: string;
  is_active: boolean;
  authorization_revision: number;
}

interface ProviderBindingRow {
  provider_issuer: string;
  provider_subject: string;
  actor_id: string;
  created_at: string | Date;
}

interface MembershipRow {
  membership_id: string;
  actor_id: string;
  tenant_id: string;
  role: string;
  status: string;
  learner_id: string | null;
  revision: number;
  tenant_name: string;
}

interface SessionRow {
  session_id: string;
  verifier_hash: string;
  actor_id: string;
  membership_id: string;
  tenant_id: string;
  provider_session_id: string;
  provider_subject: string;
  session_generation: string;
  authorization_revision: number;
  revision: number;
  provider_credentials_ciphertext: string | null;
  created_at: string | Date;
  last_activity_at: string | Date;
  absolute_expires_at: string | Date;
  revoked_at: string | Date | null;
}

interface PendingRow {
  pending_id: string;
  verifier_hash: string;
  actor_id: string;
  memberships: unknown;
  provider_session_id: string;
  provider_subject: string;
  provider_credentials_ciphertext: string | null;
  created_at: string | Date;
  expires_at: string | Date;
  consumed_at: string | Date | null;
}

const createSqlClient = (databaseUrl: string): SqlClient => {
  return postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 30,
    prepare: false,
  });
};

const withDatabase = async <T>(
  databaseUrl: string,
  work: (sql: SqlClient) => Promise<T>
): Promise<T> => {
  const sql = createSqlClient(databaseUrl);

  try {
    return await work(sql);
  } finally {
    await sql.end({ timeout: 3 });
  }
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

const timestamp = (value: string | Date, field: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Stored ${field} is not a valid timestamp.`);
  }
  return parsed.toISOString();
};

const parseRole = (value: string): IdentityRole => {
  if (value === "teacher" || value === "student") {
    return value;
  }
  throw new Error("Stored membership role is not a known role.");
};

const parseStatus = (value: string): "active" | "revoked" => {
  if (value === "active" || value === "revoked") {
    return value;
  }
  throw new Error("Stored membership status is not a known status.");
};

const actorFromRow = (row: ActorRow): ActorRecord => {
  return {
    actorId: parseActorId(row.id),
    displayName: row.display_name,
    isActive: row.is_active,
    authorizationRevision: row.authorization_revision,
  };
};

const bindingFromRow = (row: ProviderBindingRow): ProviderBindingRecord => {
  return {
    providerIssuer: row.provider_issuer,
    providerSubject: row.provider_subject,
    actorId: parseActorId(row.actor_id),
    createdAt: timestamp(row.created_at, "binding created_at"),
  };
};

const membershipFromRow = (row: MembershipRow): MembershipRecord => {
  return {
    membershipId: parseMembershipId(row.membership_id),
    actorId: parseActorId(row.actor_id),
    tenantId: parseTenantId(row.tenant_id),
    tenantName: row.tenant_name,
    role: parseRole(row.role),
    status: parseStatus(row.status),
    revision: row.revision,
    ...(row.learner_id && { learnerId: parseLearnerId(row.learner_id) }),
  };
};

const sessionFromRow = (row: SessionRow): IdentitySessionRecord => {
  return {
    sessionId: row.session_id,
    verifierHash: row.verifier_hash,
    actorId: parseActorId(row.actor_id),
    membershipId: parseMembershipId(row.membership_id),
    tenantId: parseTenantId(row.tenant_id),
    providerSessionId: row.provider_session_id,
    providerSubject: row.provider_subject,
    sessionGeneration: row.session_generation,
    authorizationRevision: row.authorization_revision,
    revision: row.revision,
    createdAt: timestamp(row.created_at, "session created_at"),
    lastActivityAt: timestamp(row.last_activity_at, "session last_activity_at"),
    absoluteExpiresAt: timestamp(
      row.absolute_expires_at,
      "session absolute_expires_at"
    ),
    ...(row.provider_credentials_ciphertext && {
      providerCredentialsCiphertext: row.provider_credentials_ciphertext,
    }),
    ...(row.revoked_at && {
      revokedAt: timestamp(row.revoked_at, "session revoked_at"),
    }),
  };
};

const parsePendingMemberships = (value: unknown): PendingMembershipOption[] => {
  const decoded =
    typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(decoded)) {
    throw new TypeError("Stored pending memberships are not an array.");
  }
  return decoded.map((entry) => {
    const option = entry as Record<string, unknown>;
    return {
      membershipId: parseMembershipId(String(option.membershipId)),
      tenantName: String(option.tenantName),
      role: parseRole(String(option.role)),
    };
  });
};

const pendingFromRow = (row: PendingRow): PendingAuthenticationRecord => {
  return {
    pendingId: row.pending_id,
    verifierHash: row.verifier_hash,
    actorId: parseActorId(row.actor_id),
    memberships: parsePendingMemberships(row.memberships),
    providerSessionId: row.provider_session_id,
    providerSubject: row.provider_subject,
    ...(row.provider_credentials_ciphertext && {
      providerCredentialsCiphertext: row.provider_credentials_ciphertext,
    }),
    createdAt: timestamp(row.created_at, "pending created_at"),
    expiresAt: timestamp(row.expires_at, "pending expires_at"),
    ...(row.consumed_at && {
      consumedAt: timestamp(row.consumed_at, "pending consumed_at"),
    }),
  };
};

const readSessionScope = async (
  transaction: SqlTransaction,
  sessionId: string
): Promise<string | undefined> => {
  const rows = await transaction<{ tenant_id: string }[]>`
    select tenant_id
    from identity_lookup_session_by_id(${sessionId})
  `;
  return rows.length === 0 ? undefined : rows[0].tenant_id;
};

const readMembershipScope = async (
  transaction: SqlTransaction,
  membershipId: string
): Promise<string | undefined> => {
  const rows = await transaction<{ tenant_id: string }[]>`
    select tenant_id
    from identity_lookup_membership(${membershipId})
  `;
  return rows.length === 0 ? undefined : rows[0].tenant_id;
};

const insertSession = async (
  transaction: SqlTransaction,
  input: NewSessionInput
): Promise<void> => {
  await transaction`
    insert into identity_sessions (
      session_id,
      verifier_hash,
      actor_id,
      membership_id,
      tenant_id,
      provider_session_id,
      provider_subject,
      session_generation,
      authorization_revision,
      provider_credentials_ciphertext,
      created_at,
      last_activity_at,
      absolute_expires_at
    )
    values (
      ${input.sessionId},
      ${input.verifierHash},
      ${input.actorId},
      ${input.membershipId},
      ${input.tenantId},
      ${input.providerSessionId},
      ${input.providerSubject},
      ${input.sessionGeneration},
      ${input.authorizationRevision},
      ${input.providerCredentialsCiphertext ?? null},
      ${input.createdAt},
      ${input.lastActivityAt},
      ${input.absoluteExpiresAt}
    )
  `;
};

const readActorById = async (
  sql: SqlClient,
  actorId: ActorId
): Promise<ActorRecord | undefined> => {
  const rows = await sql<ActorRow[]>`
    select id, display_name, is_active, authorization_revision
    from actors
    where id = ${actorId}
    limit 1
  `;
  return rows.length === 0 ? undefined : actorFromRow(rows[0]);
};

const createActor = async (
  sql: SqlClient,
  input: NewActorInput
): Promise<ActorRecord> => {
  const inserted = await sql<ActorRow[]>`
    insert into actors (id, display_name, is_active)
    values (${input.actorId}, ${input.displayName}, ${input.isActive ?? true})
    on conflict (id) do nothing
    returning id, display_name, is_active, authorization_revision
  `;
  if (inserted.length > 0) {
    return actorFromRow(inserted[0]);
  }

  const existing = await readActorById(sql, input.actorId);
  if (!existing) {
    throw new Error("The actor could not be provisioned.");
  }
  return existing;
};

const selectMembershipForActor = (
  transaction: SqlTransaction,
  input: NewMembershipInput
): Promise<MembershipRow[]> => {
  return transaction<MembershipRow[]>`
    select
      id as membership_id,
      actor_id,
      tenant_id,
      role,
      status,
      learner_id,
      revision,
      ${input.tenantName} as tenant_name
    from memberships
    where actor_id = ${input.actorId}
      and tenant_id = ${input.tenantId}
      and role = ${input.role}
    limit 1
  `;
};

const grantMembership = async (
  transaction: SqlTransaction,
  input: NewMembershipInput
): Promise<MembershipRecord> => {
  // Trusted provisioning must stay insert-if-missing: a grant creates the
  // tenant a fresh database lacks, but never renames or rebrands a row that
  // already exists.
  await transaction`
    insert into tenants (id, slug, name, synthetic_data_only)
    values (${input.tenantId}, ${input.tenantId}, ${input.tenantName}, true)
    on conflict (id) do nothing
  `;

  if (input.learnerId) {
    await transaction`
      insert into identities (id, tenant_id, role, display_name, demo_handle, is_active)
      values (
        ${input.learnerId},
        ${input.tenantId},
        ${input.role},
        ${input.learnerId},
        ${input.learnerId},
        true
      )
      on conflict (id) do nothing
    `;
  }

  await transaction`
    insert into memberships (id, actor_id, tenant_id, role, status, learner_id)
    values (
      ${input.membershipId},
      ${input.actorId},
      ${input.tenantId},
      ${input.role},
      'active',
      ${input.learnerId ?? null}
    )
    on conflict (actor_id, tenant_id, role) do nothing
  `;

  const rows = await selectMembershipForActor(transaction, input);
  if (rows.length === 0) {
    throw new Error("The membership could not be provisioned.");
  }
  return membershipFromRow(rows[0]);
};

const assignClass = async (
  transaction: SqlTransaction,
  input: NewClassAssignmentInput
): Promise<void> => {
  await transaction`
    insert into class_assignments (membership_id, class_id, tenant_id)
    values (${input.membershipId}, ${input.classId}, ${input.tenantId})
    on conflict (membership_id, class_id) do nothing
  `;
};

const createSession = (
  databaseUrl: string,
  input: NewSessionInput
): Promise<void> => {
  return withDatabase(databaseUrl, (sql) => {
    return sql.begin(async (transaction) => {
      await transaction`
        select set_config('app.tenant_id', ${input.tenantId}, true)
      `;
      await insertSession(transaction, input);
    });
  });
};

const readSessionByVerifier = (
  databaseUrl: string,
  verifierHash: string
): Promise<IdentitySessionRecord | undefined> => {
  return withDatabase(databaseUrl, async (sql) => {
    const rows = await sql<SessionRow[]>`
      select *
      from identity_lookup_session(${verifierHash})
    `;
    return rows.length === 0 ? undefined : sessionFromRow(rows[0]);
  });
};

const readSession = (
  databaseUrl: string,
  sessionId: string
): Promise<IdentitySessionRecord | undefined> => {
  return withDatabase(databaseUrl, async (sql) => {
    const rows = await sql<SessionRow[]>`
      select *
      from identity_lookup_session_by_id(${sessionId})
    `;
    return rows.length === 0 ? undefined : sessionFromRow(rows[0]);
  });
};

const revokeSession = (
  databaseUrl: string,
  sessionId: string,
  revokedAt: string
): Promise<IdentitySessionRecord | undefined> => {
  return withDatabase(databaseUrl, (sql) => {
    return sql.begin(async (transaction) => {
      const tenantId = await readSessionScope(transaction, sessionId);
      let revoked: IdentitySessionRecord | undefined;
      if (tenantId) {
        await transaction`
          select set_config('app.tenant_id', ${tenantId}, true)
        `;
        const rows = await transaction<SessionRow[]>`
          update identity_sessions
          set
            revoked_at = ${revokedAt},
            revision = revision + 1
          where session_id = ${sessionId}
            and revoked_at is null
          returning *
        `;
        revoked = rows.length === 0 ? undefined : sessionFromRow(rows[0]);
      }
      return revoked;
    });
  });
};

const findProviderBinding = (
  databaseUrl: string,
  issuer: string,
  subject: string
): Promise<ProviderBindingRecord | undefined> => {
  return withDatabase(databaseUrl, async (sql) => {
    const rows = await sql<ProviderBindingRow[]>`
      select provider_issuer, provider_subject, actor_id, created_at
      from provider_bindings
      where provider_issuer = ${issuer} and provider_subject = ${subject}
      limit 1
    `;
    return rows.length === 0 ? undefined : bindingFromRow(rows[0]);
  });
};

const createProviderBinding = (
  databaseUrl: string,
  binding: ProviderBindingRecord
): Promise<ProviderBindingRecord> => {
  return withDatabase(databaseUrl, (sql) => {
    return sql.begin(async (transaction) => {
      // `on conflict do nothing` rather than catching the unique violation:
      // postgres.js rethrows the first query error out of `begin` even when it
      // is caught, so a caught constraint error would escape as a raw driver
      // error instead of the application conflict.
      const inserted = await transaction<ProviderBindingRow[]>`
        insert into provider_bindings (
          provider_issuer,
          provider_subject,
          actor_id,
          created_at
        )
        values (
          ${binding.providerIssuer},
          ${binding.providerSubject},
          ${binding.actorId},
          ${binding.createdAt}
        )
        on conflict do nothing
        returning provider_issuer, provider_subject, actor_id, created_at
      `;

      const [created] = inserted;
      if (created) {
        return bindingFromRow(created);
      }

      const existing = await transaction<ProviderBindingRow[]>`
        select provider_issuer, provider_subject, actor_id, created_at
        from provider_bindings
        where provider_issuer = ${binding.providerIssuer}
          and provider_subject = ${binding.providerSubject}
        limit 1
      `;
      const [pair] = existing;
      // Replaying the same binding is idempotent; any other conflict is
      // rejected so a provider subject cannot be rebound to another actor.
      if (pair && pair.actor_id === binding.actorId) {
        return bindingFromRow(pair);
      }
      throw new IdentityError("CONFLICT");
    });
  });
};

const listMemberships = (
  databaseUrl: string,
  actorId: ActorId
): Promise<readonly MembershipRecord[]> => {
  return withDatabase(databaseUrl, async (sql) => {
    const rows = await sql<MembershipRow[]>`
      select
        membership_id,
        actor_id,
        tenant_id,
        role,
        status,
        learner_id,
        revision,
        tenant_name
      from identity_list_actor_memberships(${actorId})
    `;
    return rows.map(membershipFromRow);
  });
};

const readMembership = (
  databaseUrl: string,
  membershipId: string
): Promise<MembershipRecord | undefined> => {
  return withDatabase(databaseUrl, async (sql) => {
    const rows = await sql<MembershipRow[]>`
      select
        membership_id,
        actor_id,
        tenant_id,
        role,
        status,
        learner_id,
        revision,
        tenant_name
      from identity_lookup_membership(${membershipId})
    `;
    return rows.length === 0 ? undefined : membershipFromRow(rows[0]);
  });
};

const readTenantName = (
  databaseUrl: string,
  tenantId: TenantId
): Promise<string | undefined> => {
  return withDatabase(databaseUrl, (sql) => {
    return sql.begin(async (transaction) => {
      await transaction`
        select set_config('app.tenant_id', ${tenantId}, true)
      `;
      const rows = await transaction<{ name: string }[]>`
        select name from tenants where id = ${tenantId} limit 1
      `;
      return rows.length === 0 ? undefined : rows[0].name;
    });
  });
};

const listRosterClassIds = (
  databaseUrl: string,
  membershipId: string
): Promise<readonly ClassId[]> => {
  return withDatabase(databaseUrl, (sql) => {
    return sql.begin(async (transaction) => {
      const tenantId = await readMembershipScope(transaction, membershipId);
      if (!tenantId) {
        return [];
      }
      await transaction`
        select set_config('app.tenant_id', ${tenantId}, true)
      `;
      const rows = await transaction<{ class_id: string }[]>`
        select class_id
        from class_assignments
        where membership_id = ${membershipId}
        order by class_id asc
      `;
      return rows.map((row) => parseClassId(row.class_id));
    });
  });
};

const createPendingAuthentication = (
  databaseUrl: string,
  record: PendingAuthenticationRecord
): Promise<void> => {
  return withDatabase(databaseUrl, async (sql) => {
    await sql`
      insert into pending_authentications (
        pending_id,
        verifier_hash,
        actor_id,
        memberships,
        provider_session_id,
        provider_subject,
        provider_credentials_ciphertext,
        created_at,
        expires_at
      )
      values (
        ${record.pendingId},
        ${record.verifierHash},
        ${record.actorId},
        ${sql.json(jsonValue(record.memberships))}::jsonb,
        ${record.providerSessionId},
        ${record.providerSubject},
        ${record.providerCredentialsCiphertext ?? null},
        ${record.createdAt},
        ${record.expiresAt}
      )
      on conflict (pending_id) do nothing
    `;
  });
};

const readPendingAuthentication = (
  databaseUrl: string,
  verifierHash: string
): Promise<PendingAuthenticationRecord | undefined> => {
  return withDatabase(databaseUrl, async (sql) => {
    const rows = await sql<PendingRow[]>`
      select *
      from identity_lookup_pending(${verifierHash})
    `;
    return rows.length === 0 ? undefined : pendingFromRow(rows[0]);
  });
};

const appendProvisioningAudit = (
  databaseUrl: string,
  entry: ProvisioningAuditEntry
): Promise<void> => {
  return withDatabase(databaseUrl, async (sql) => {
    await sql`
      insert into provisioning_audit (
        id,
        principal,
        operation,
        target_id,
        result,
        request_id,
        created_at
      )
      values (
        ${createId()},
        ${entry.principal},
        ${entry.operation},
        ${entry.targetId},
        ${entry.result},
        ${entry.requestId},
        ${entry.at}
      )
    `;
  });
};

export const createPostgresIdentityPersistence = (
  databaseUrl: string,
  options: PostgresIdentityPersistenceOptions = {}
): IdentityPersistence => {
  const observability = options.observability ?? serverObservability;

  if (!databaseUrl) {
    const error = new Error(
      "PostgreSQL identity persistence requires DATABASE_URL."
    );
    observability.captureError(error, {
      operation: "identity.persistence.create",
      dependency: "postgres",
      reason: "missing_database_url",
      code: "DATABASE_REQUIRED",
    });
    throw error;
  }

  return {
    findProviderBinding: (issuer, subject) =>
      findProviderBinding(databaseUrl, issuer, subject),
    createProviderBinding: (binding) =>
      createProviderBinding(databaseUrl, binding),

    readActor: (actorId) =>
      withDatabase(databaseUrl, (sql) => readActorById(sql, actorId)),
    createActor: (input) =>
      withDatabase(databaseUrl, (sql) => createActor(sql, input)),
    listMemberships: (actorId) => listMemberships(databaseUrl, actorId),
    readMembership: (membershipId) => readMembership(databaseUrl, membershipId),
    readTenantName: (tenantId) => readTenantName(databaseUrl, tenantId),
    listRosterClassIds: (membershipId) =>
      listRosterClassIds(databaseUrl, membershipId),

    createSession: (input) => createSession(databaseUrl, input),
    readSessionByVerifier: (verifierHash) =>
      readSessionByVerifier(databaseUrl, verifierHash),
    readSession: (sessionId) => readSession(databaseUrl, sessionId),
    touchSession: (update) => {
      return withDatabase(databaseUrl, (sql) => {
        return sql.begin(async (transaction) => {
          const tenantId = await readSessionScope(
            transaction,
            update.sessionId
          );
          if (!tenantId) {
            return false;
          }
          await transaction`
            select set_config('app.tenant_id', ${tenantId}, true)
          `;
          const rows = await transaction<{ session_id: string }[]>`
            update identity_sessions
            set
              last_activity_at = ${update.lastActivityAt},
              revision = revision + 1
            where session_id = ${update.sessionId}
              and revision = ${update.expectedRevision}
              and revoked_at is null
            returning session_id
          `;
          return rows.length > 0;
        });
      });
    },
    rotateSessionCredentials: (replacement) => {
      return withDatabase(databaseUrl, (sql) => {
        return sql.begin(async (transaction) => {
          const tenantId = await readSessionScope(
            transaction,
            replacement.sessionId
          );
          if (!tenantId) {
            return false;
          }
          await transaction`
            select set_config('app.tenant_id', ${tenantId}, true)
          `;
          const rows = await transaction<{ session_id: string }[]>`
            update identity_sessions
            set
              provider_credentials_ciphertext = ${replacement.providerCredentialsCiphertext},
              revision = revision + 1
            where session_id = ${replacement.sessionId}
              and revision = ${replacement.expectedRevision}
              and revoked_at is null
            returning session_id
          `;
          return rows.length > 0;
        });
      });
    },
    revokeSession: (sessionId, revokedAt) =>
      revokeSession(databaseUrl, sessionId, revokedAt),

    createPendingAuthentication: (record) =>
      createPendingAuthentication(databaseUrl, record),
    readPendingAuthentication: (verifierHash) =>
      readPendingAuthentication(databaseUrl, verifierHash),
    consumePendingAuthentication: (pendingId, consumedAt) => {
      return withDatabase(databaseUrl, async (sql) => {
        const rows = await sql<{ pending_id: string }[]>`
          update pending_authentications
          set consumed_at = ${consumedAt}
          where pending_id = ${pendingId} and consumed_at is null
          returning pending_id
        `;
        return rows.length > 0;
      });
    },

    grantMembership: (input) => {
      return withDatabase(databaseUrl, (sql) => {
        return sql.begin(async (transaction) => {
          await transaction`
            select set_config('app.tenant_id', ${input.tenantId}, true)
          `;
          return grantMembership(transaction, input);
        });
      });
    },
    assignClass: (input) => {
      return withDatabase(databaseUrl, (sql) => {
        return sql.begin(async (transaction) => {
          await transaction`
            select set_config('app.tenant_id', ${input.tenantId}, true)
          `;
          return assignClass(transaction, input);
        });
      });
    },
    revokeMembership: (membershipId) => {
      return withDatabase(databaseUrl, (sql) => {
        return sql.begin(async (transaction) => {
          const tenantId = await readMembershipScope(transaction, membershipId);
          if (!tenantId) {
            return false;
          }
          await transaction`
            select set_config('app.tenant_id', ${tenantId}, true)
          `;
          const rows = await transaction<{ id: string }[]>`
            update memberships
            set status = 'revoked', revision = revision + 1
            where id = ${membershipId} and status = 'active'
            returning id
          `;
          return rows.length > 0;
        });
      });
    },
    disableActor: (actorId) => {
      return withDatabase(databaseUrl, async (sql) => {
        const now = new Date();
        const rows = await sql<{ disabled: boolean }[]>`
          select identity_disable_actor(${actorId}, ${now.toISOString()}) as disabled
        `;
        return rows.length > 0 ? rows[0].disabled : false;
      });
    },

    appendProvisioningAudit: (entry) =>
      appendProvisioningAudit(databaseUrl, entry),
  };
};
