import { describe, expect, it } from "vitest";

import { createSeededGenerationLimitStore } from "./limits-seeded";
import type { LeaseRelease, ProviderCallReservation } from "../limits/contract";

const reservation = (
  overrides: Partial<ProviderCallReservation> = {}
): ProviderCallReservation => {
  return {
    tenantId: "tenant_limits_a",
    teacherId: "actor_teacher_a",
    sessionId: "session_a",
    requestId: "draft_a",
    attemptNumber: 1,
    correction: false,
    leaseTtlMs: 60_000,
    ...overrides,
  };
};

const release = (overrides: Partial<LeaseRelease> = {}): LeaseRelease => {
  return {
    tenantId: "tenant_limits_a",
    teacherId: "actor_teacher_a",
    requestId: "draft_a",
    attemptNumber: 1,
    ...overrides,
  };
};

describe("seeded generation limit store", () => {
  it("rejects past the provider-call budget and consumes nothing", async () => {
    const limits = createSeededGenerationLimitStore({
      policy: { tenantProviderCallsPerDay: 2 },
    });
    const correction = reservation({ correction: true });

    await expect(limits.reserveProviderCall(correction)).resolves.toMatchObject(
      { allowed: true }
    );
    await expect(limits.reserveProviderCall(correction)).resolves.toMatchObject(
      { allowed: true }
    );

    const rejected = await limits.reserveProviderCall(correction);

    expect(rejected).toMatchObject({
      allowed: false,
      limitedBy: { kind: "provider-call" },
    });
    expect(rejected.retryAfterMs).toBeGreaterThan(0);
    expect(limits.snapshot().counters).toContainEqual(
      expect.objectContaining({ kind: "provider-call", count: 2 })
    );
  });

  it("counts a correction as a provider call but not a new attempt", async () => {
    const limits = createSeededGenerationLimitStore();

    await limits.reserveProviderCall(reservation());
    await limits.releaseGenerationLease(release());
    await limits.reserveProviderCall(reservation({ correction: true }));

    const counts = limits
      .snapshot()
      .counters.map((counter) => [counter.kind, counter.count]);

    expect(counts).toContainEqual(["provider-call", 2]);
    expect(counts).toContainEqual(["generation-attempt", 1]);
    expect(counts).toContainEqual(["authoring-request", 1]);
  });

  it("enforces the session burst from the same policy", async () => {
    const limits = createSeededGenerationLimitStore({
      policy: { sessionAuthoringRequestsPerMinute: 2 },
    });

    await limits.reserveProviderCall(reservation({ requestId: "draft_1" }));
    await limits.releaseGenerationLease(release({ requestId: "draft_1" }));
    await limits.reserveProviderCall(reservation({ requestId: "draft_2" }));
    await limits.releaseGenerationLease(release({ requestId: "draft_2" }));

    const rejected = await limits.reserveProviderCall(
      reservation({ requestId: "draft_3" })
    );

    expect(rejected).toMatchObject({
      allowed: false,
      limitedBy: { kind: "authoring-request", window: "minute" },
    });
  });

  it("keeps one active generation per teacher and releases only its holder", async () => {
    const limits = createSeededGenerationLimitStore();

    await limits.reserveProviderCall(reservation({ requestId: "draft_1" }));
    const blocked = await limits.reserveProviderCall(
      reservation({ requestId: "draft_2" })
    );

    expect(blocked).toMatchObject({
      allowed: false,
      limitedBy: { kind: "active-generation" },
    });

    await limits.releaseGenerationLease(
      release({ requestId: "other_request" })
    );

    expect(limits.snapshot().leases).toHaveLength(1);

    await limits.releaseGenerationLease(release({ requestId: "draft_1" }));

    expect(limits.snapshot().leases).toHaveLength(0);
    await expect(
      limits.reserveProviderCall(reservation({ requestId: "draft_2" }))
    ).resolves.toMatchObject({ allowed: true });
  });

  it("reclaims an expired lease", async () => {
    let clock = Date.parse("2026-11-03T10:00:00.000Z");
    const limits = createSeededGenerationLimitStore({ now: () => clock });

    await limits.reserveProviderCall(
      reservation({ requestId: "draft_1", leaseTtlMs: 1000 })
    );
    clock += 5000;

    await expect(
      limits.reserveProviderCall(reservation({ requestId: "draft_2" }))
    ).resolves.toMatchObject({ allowed: true });
  });

  it("starts a fresh window when the clock crosses the boundary", async () => {
    let clock = Date.parse("2026-11-03T10:59:59.000Z");
    const limits = createSeededGenerationLimitStore({
      policy: { sessionAuthoringRequestsPerMinute: 1 },
      now: () => clock,
    });

    await limits.reserveProviderCall(reservation({ requestId: "draft_1" }));
    await limits.releaseGenerationLease(release({ requestId: "draft_1" }));

    await expect(
      limits.reserveProviderCall(reservation({ requestId: "draft_2" }))
    ).resolves.toMatchObject({ allowed: false });

    clock += 2000;

    await expect(
      limits.reserveProviderCall(reservation({ requestId: "draft_2" }))
    ).resolves.toMatchObject({ allowed: true });
  });
});
