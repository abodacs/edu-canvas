import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { afterAll, describe, expect, it } from "vitest";

import { generationLimitPolicy } from "../limits/config";
import { createPostgresGenerationLimitStore } from "./limits-postgres";
import {
  isRunDatabaseTests,
  requireDatabaseUrl,
  withTenantSql,
} from "./database-test-support";
import type { ProviderCallReservation } from "../limits/contract";

const databaseUrl = isRunDatabaseTests ? requireDatabaseUrl() : "";
const tenants = new Set<string>();

const newTenant = (): { tenantId: string; teacherId: string } => {
  const tenantId = `tenant_limits_${randomUUID()}`;
  tenants.add(tenantId);
  return { tenantId, teacherId: `actor_teacher_${randomUUID()}` };
};

const reservation = (
  tenantId: string,
  teacherId: string,
  requestId: string,
  overrides: Partial<ProviderCallReservation> = {}
): ProviderCallReservation => {
  return {
    tenantId,
    teacherId,
    sessionId: "session_limits",
    requestId,
    attemptNumber: 1,
    correction: false,
    leaseTtlMs: 60_000,
    ...overrides,
  };
};

const counterCounts = (tenantId: string): Promise<Record<string, number>> => {
  return withTenantSql(tenantId, async (transaction) => {
    const rows = await transaction<
      { scope_kind: string; counter_kind: string; count: number }[]
    >`
      select scope_kind, counter_kind, sum(count)::int as count
      from request_limit_counters
      where tenant_id = ${tenantId}
      group by scope_kind, counter_kind
    `;
    return Object.fromEntries(
      rows.map((row) => [`${row.scope_kind}:${row.counter_kind}`, row.count])
    );
  });
};

describe.skipIf(!isRunDatabaseTests)("shared generation limits", () => {
  afterAll(async () => {
    for (const tenantId of tenants) {
      // eslint-disable-next-line no-await-in-loop -- cleanup is per fixture.
      await withTenantSql(tenantId, async (transaction) => {
        await transaction`delete from active_generation_leases where tenant_id = ${tenantId}`;
        await transaction`delete from request_limit_counters where tenant_id = ${tenantId}`;
      });
    }
  });

  it("lets exactly one of two clients take the last teacher slot", async () => {
    const { tenantId, teacherId } = newTenant();
    const firstClient = createPostgresGenerationLimitStore(databaseUrl);
    const secondClient = createPostgresGenerationLimitStore(databaseUrl);

    const teacherLimit = generationLimitPolicy.teacherGenerationAttemptsPerHour;
    for (let index = 0; index < teacherLimit - 1; index += 1) {
      const requestId = `draft_warmup_${index}`;
      // eslint-disable-next-line no-await-in-loop -- ordered warm-up so the last slot is deterministic.
      const reserved = await firstClient.reserveProviderCall(
        reservation(tenantId, teacherId, requestId)
      );

      expect(reserved.allowed).toBeTruthy();

      // eslint-disable-next-line no-await-in-loop -- release the warmed-up lease before the next reservation.
      await firstClient.releaseGenerationLease({
        tenantId,
        teacherId,
        requestId,
        attemptNumber: 1,
      });
    }

    const [left, right] = await Promise.all([
      firstClient.reserveProviderCall(
        reservation(tenantId, teacherId, "draft_race_left")
      ),
      secondClient.reserveProviderCall(
        reservation(tenantId, teacherId, "draft_race_right")
      ),
    ]);

    expect([left.allowed, right.allowed].filter(Boolean)).toHaveLength(1);

    const rejected = left.allowed ? right : left;

    expect(rejected).toMatchObject({
      allowed: false,
      limitedBy: { kind: "generation-attempt" },
    });

    const counts = await counterCounts(tenantId);

    // Nine warm-ups plus one winner: the rejected transaction rolled back its
    // provider-call increment instead of spending an eleventh call.
    expect(counts).toMatchObject({
      "teacher:generation-attempt": teacherLimit,
      "tenant:generation-attempt": teacherLimit,
      "tenant:provider-call": teacherLimit,
    });
  });

  it("does not let a second client start a second active generation", async () => {
    const { tenantId, teacherId } = newTenant();
    const firstClient = createPostgresGenerationLimitStore(databaseUrl);
    const secondClient = createPostgresGenerationLimitStore(databaseUrl);

    await expect(
      firstClient.reserveProviderCall(
        reservation(tenantId, teacherId, "draft_active")
      )
    ).resolves.toMatchObject({ allowed: true });

    const blocked = await secondClient.reserveProviderCall(
      reservation(tenantId, teacherId, "draft_blocked")
    );

    expect(blocked).toMatchObject({
      allowed: false,
      limitedBy: { kind: "active-generation" },
    });

    await firstClient.releaseGenerationLease({
      tenantId,
      teacherId,
      requestId: "draft_active",
      attemptNumber: 1,
    });

    await expect(
      secondClient.reserveProviderCall(
        reservation(tenantId, teacherId, "draft_blocked")
      )
    ).resolves.toMatchObject({ allowed: true });
  });

  it("reclaims an expired lease instead of locking the teacher out", async () => {
    const { tenantId, teacherId } = newTenant();
    const store = createPostgresGenerationLimitStore(databaseUrl);

    await expect(
      store.reserveProviderCall(
        reservation(tenantId, teacherId, "draft_expiring", { leaseTtlMs: 1 })
      )
    ).resolves.toMatchObject({ allowed: true });

    await delay(20);

    await expect(
      store.reserveProviderCall(
        reservation(tenantId, teacherId, "draft_after_expiry")
      )
    ).resolves.toMatchObject({ allowed: true });
  });

  it("keeps tenant budgets separate", async () => {
    const first = newTenant();
    const second = newTenant();
    const store = createPostgresGenerationLimitStore(databaseUrl);

    const teacherLimit = generationLimitPolicy.teacherGenerationAttemptsPerHour;
    for (let index = 0; index < teacherLimit; index += 1) {
      const requestId = `draft_tenant_a_${index}`;
      // eslint-disable-next-line no-await-in-loop -- ordered exhaustion of tenant A.
      const reserved = await store.reserveProviderCall(
        reservation(first.tenantId, first.teacherId, requestId)
      );
      // eslint-disable-next-line no-await-in-loop -- release before the next attempt.
      await store.releaseGenerationLease({
        tenantId: first.tenantId,
        teacherId: first.teacherId,
        requestId,
        attemptNumber: 1,
      });

      expect(reserved.allowed).toBeTruthy();
    }

    const exhausted = await store.reserveProviderCall(
      reservation(first.tenantId, first.teacherId, "draft_tenant_a_over")
    );

    expect(exhausted).toMatchObject({ allowed: false });

    await expect(
      store.reserveProviderCall(
        reservation(second.tenantId, second.teacherId, "draft_tenant_b_first")
      )
    ).resolves.toMatchObject({ allowed: true });
  });
});
