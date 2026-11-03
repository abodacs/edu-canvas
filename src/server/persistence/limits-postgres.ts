import postgres from "postgres";

import { generationLimitPolicy } from "../limits/config";
import { generationLeaseHolder } from "../limits/contract";
import {
  counterClaimsFor,
  leaseHolderFor,
  windowBounds,
} from "../limits/policy";
import type {
  GenerationLimitStore,
  LeaseRelease,
  LimitCounterClaim,
  LimitVerdict,
  ProviderCallReservation,
} from "../limits/contract";

type SqlClient = ReturnType<typeof postgres>;
type SqlTransaction = postgres.TransactionSql;

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

/**
An internal signal that aborts the reservation transaction. The public store surface returns a verdict; the throw is what makes the rejection roll back every increment already applied in the same transaction.
*/
class LimitExceededSignalError extends Error {
  readonly verdict: LimitVerdict;

  constructor(verdict: LimitVerdict, options?: ErrorOptions) {
    super("The request limit rejected this reservation.", options);
    this.name = "LimitExceededSignalError";
    this.verdict = verdict;
  }
}

const limitExceeded = (
  claim: LimitCounterClaim,
  retryAfterMs: number
): LimitExceededSignalError => {
  return new LimitExceededSignalError({
    allowed: false,
    retryAfterMs,
    limitedBy: {
      kind: claim.kind,
      scopeKind: claim.scopeKind,
      scopeId: claim.scopeId,
      window: claim.window,
    },
  });
};

const hasCounterCapacity = async (
  transaction: SqlTransaction,
  tenantId: string,
  claim: LimitCounterClaim,
  bounds: ReturnType<typeof windowBounds>
): Promise<boolean> => {
  const rows = await transaction<{ count: number }[]>`
    insert into request_limit_counters (
      tenant_id,
      scope_kind,
      scope_id,
      counter_kind,
      window_start,
      window_end,
      count
    )
    values (
      ${tenantId},
      ${claim.scopeKind},
      ${claim.scopeId},
      ${claim.kind},
      ${bounds.windowStart},
      ${bounds.windowEnd},
      1
    )
    on conflict (tenant_id, scope_kind, scope_id, counter_kind, window_start)
    do update set count = request_limit_counters.count + 1
    where request_limit_counters.count < ${claim.limit}
    returning count
  `;

  return rows.length > 0;
};

const acquireLease = async (
  transaction: SqlTransaction,
  input: ProviderCallReservation,
  holder: string,
  nowIso: string,
  expiresAt: string
): Promise<{ acquired: boolean; retryAfterMs: number }> => {
  const rows = await transaction<{ expires_at: Date }[]>`
    insert into active_generation_leases (
      tenant_id,
      teacher_id,
      holder,
      acquired_at,
      expires_at
    )
    values (
      ${input.tenantId},
      ${input.teacherId},
      ${holder},
      ${nowIso},
      ${expiresAt}
    )
    on conflict (tenant_id, teacher_id)
    do update set
      holder = excluded.holder,
      acquired_at = excluded.acquired_at,
      expires_at = excluded.expires_at
    where active_generation_leases.expires_at <= ${nowIso}
       or active_generation_leases.holder = excluded.holder
    returning expires_at
  `;
  if (rows.length > 0) {
    return { acquired: true, retryAfterMs: 0 };
  }

  const existing = await transaction<{ expires_at: Date }[]>`
    select expires_at
    from active_generation_leases
    where tenant_id = ${input.tenantId} and teacher_id = ${input.teacherId}
    limit 1
  `;
  const expiresAtMs = existing[0]?.expires_at.getTime() ?? Date.parse(nowIso);
  return {
    acquired: false,
    retryAfterMs: Math.max(1, expiresAtMs - Date.parse(nowIso)),
  };
};

const reserveInTransaction = async (
  transaction: SqlTransaction,
  input: ProviderCallReservation
): Promise<LimitVerdict> => {
  await transaction`
    select set_config('app.tenant_id', ${input.tenantId}, true)
  `;
  const clock = await transaction<{ now: Date }[]>`select now() as now`;
  const nowIso = (clock[0]?.now ?? new Date()).toISOString();
  const nowMs = Date.parse(nowIso);
  const claims = counterClaimsFor(input, generationLimitPolicy);

  // Each counter is one conditional write. A zero-row result means the limit
  // is already at capacity; throwing rolls back the earlier increments.
  for (const claim of claims) {
    const bounds = windowBounds(claim.window, nowMs);
    if (claim.limit <= 0) {
      throw limitExceeded(claim, bounds.retryAfterMs);
    }
    // eslint-disable-next-line no-await-in-loop -- one transaction connection, ordered writes.
    const reserved = await hasCounterCapacity(
      transaction,
      input.tenantId,
      claim,
      bounds
    );
    if (!reserved) {
      throw limitExceeded(claim, bounds.retryAfterMs);
    }
  }

  if (input.correction) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const holder = leaseHolderFor(input);
  const leaseExpiresAt = new Date(nowMs + Math.max(1, input.leaseTtlMs));
  const lease = await acquireLease(
    transaction,
    input,
    holder,
    nowIso,
    leaseExpiresAt.toISOString()
  );
  if (!lease.acquired) {
    throw new LimitExceededSignalError({
      allowed: false,
      retryAfterMs: lease.retryAfterMs,
      limitedBy: {
        kind: "active-generation",
        scopeKind: "teacher",
        scopeId: input.teacherId,
        window: "lease",
      },
    });
  }

  return { allowed: true, retryAfterMs: 0 };
};

/**
Shared request-limit state on the database that already owns quotas. One transaction reserves every applicable counter and the teacher's active generation lease; a rejected reservation rolls back to zero consumption.
*/
export const createPostgresGenerationLimitStore = (
  databaseUrl: string
): GenerationLimitStore => {
  return {
    async reserveProviderCall(input) {
      try {
        return await withDatabase(databaseUrl, (sql) =>
          sql.begin((transaction) => reserveInTransaction(transaction, input))
        );
      } catch (error) {
        if (error instanceof LimitExceededSignalError) {
          return error.verdict;
        }
        throw error;
      }
    },

    async releaseGenerationLease(input: LeaseRelease) {
      const holder = generationLeaseHolder(
        input.requestId,
        input.attemptNumber
      );
      await withDatabase(databaseUrl, async (sql) => {
        await sql.begin(async (transaction) => {
          await transaction`
            select set_config('app.tenant_id', ${input.tenantId}, true)
          `;
          await transaction`
            delete from active_generation_leases
            where tenant_id = ${input.tenantId}
              and teacher_id = ${input.teacherId}
              and holder = ${holder}
          `;
        });
      });
    },
  };
};
