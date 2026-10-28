import { describe, expect, it } from "vitest";

import {
  createSeededIdentityPersistence,
  createSeededIdentityStore,
} from "../persistence/identity-seeded";
import { createCredentialCipher } from "./cipher";
import { createDeterministicIdentityProvider } from "./provider/deterministic";
import { createRateLimiter } from "./rate-limit";
import { createIdentityService } from "./service";
import {
  ensureSyntheticIdentityFixture,
  syntheticAccounts,
  syntheticPasswordForTests,
  syntheticProviderIssuer,
} from "./synthetic-fixture";
import type { IdentityError } from "./errors";

import type { DeterministicAccount } from "./provider/deterministic";
import type { IdentityServiceOptions } from "./service";

const issuer = syntheticProviderIssuer;
const fixturePassword = syntheticPasswordForTests;

const createHarness = async (
  overrides: Partial<IdentityServiceOptions> = {},
  extraAccounts: readonly DeterministicAccount[] = []
) => {
  let clockMs = Date.parse("2026-01-01T00:00:00.000Z");
  const persistence = createSeededIdentityPersistence({
    store: createSeededIdentityStore(),
  });
  await ensureSyntheticIdentityFixture(persistence);

  const provider = createDeterministicIdentityProvider({
    issuer,
    accounts: [...syntheticAccounts, ...extraAccounts],
  });
  const cipher = createCredentialCipher({
    keyVersion: "1",
    keys: { "1": Uint8Array.from({ length: 32 }, () => 7).toBase64() },
  });

  const service = createIdentityService({
    persistence,
    provider,
    cipher,
    rateLimiter: createRateLimiter(),
    now: () => clockMs,
    clock: () => {
      const at = new Date(clockMs);
      return at.toISOString();
    },
    ...overrides,
  });

  return {
    service,
    persistence,
    advance: (ms: number) => {
      clockMs += ms;
    },
  };
};

const emptyPersistence = () =>
  createSeededIdentityPersistence({ store: createSeededIdentityStore() });

const minute = 60 * 1000;
const hour = 60 * minute;

const expectCode = async (
  action: Promise<unknown>,
  code: IdentityError["code"]
): Promise<void> => {
  await expect(action).rejects.toMatchObject({ code });
};

const activeSession = async () => {
  const harness = await createHarness();
  const outcome = await harness.service.signIn({
    email: "bilal.north@example.test",
    password: fixturePassword,
    sourceAddress: "203.0.113.30",
  });
  if (outcome.status !== "active") {
    throw new Error("expected an active session");
  }
  return { ...harness, outcome };
};

describe("sign-in and session establishment", () => {
  it("establishes a teacher session for a single-membership actor", async () => {
    const { service } = await createHarness();
    const outcome = await service.signIn({
      email: "bilal.north@example.test",
      password: fixturePassword,
      sourceAddress: "203.0.113.7",
    });

    expect(outcome.status).toBe("active");

    if (outcome.status !== "active") {
      throw new Error("expected an active session");
    }

    expect(outcome.actor).toMatchObject({
      role: "teacher",
      tenantId: "tenant_school_north",
      tenantName: "Northside Elementary",
      rosterClassIds: ["class_north_4a"],
    });
    expect(outcome.credential).not.toContain(outcome.session.verifierHash);
  });

  it("establishes a learner session with a server-derived learner binding", async () => {
    const { service } = await createHarness();
    const outcome = await service.signIn({
      email: "lina.north@example.test",
      password: fixturePassword,
      sourceAddress: "203.0.113.8",
    });

    expect(outcome.status).toBe("active");

    if (outcome.status !== "active" || outcome.actor.role !== "student") {
      throw new Error("expected a learner session");
    }

    expect(outcome.actor.learnerId).toBe("learner_lina");
    expect(outcome.actor.tenantId).toBe("tenant_school_north");
  });

  it("rejects wrong credentials with one generic unauthenticated error", async () => {
    const { service } = await createHarness();
    await expectCode(
      service.signIn({
        email: "bilal.north@example.test",
        password: "not-the-password",
        sourceAddress: "203.0.113.9",
      }),
      "UNAUTHENTICATED"
    );
  });

  it("rejects an unknown address with the same error", async () => {
    const { service } = await createHarness();
    await expectCode(
      service.signIn({
        email: "nobody@example.test",
        password: fixturePassword,
        sourceAddress: "203.0.113.10",
      }),
      "UNAUTHENTICATED"
    );
  });

  it("denies a verified identity that has no binding (ACCESS_NOT_PROVISIONED)", async () => {
    const { service } = await createHarness({}, [
      {
        email: "unbound@example.test",
        password: fixturePassword,
        subject: "subject_unbound",
        emailVerified: true,
      },
    ]);
    await expectCode(
      service.signIn({
        email: "unbound@example.test",
        password: fixturePassword,
        sourceAddress: "203.0.113.11",
      }),
      "ACCESS_NOT_PROVISIONED"
    );
  });

  it("reports unavailable rather than falling back when the provider is down", async () => {
    const provider = createDeterministicIdentityProvider({
      issuer,
      accounts: syntheticAccounts,
      available: false,
    });
    const offline = createIdentityService({
      persistence: emptyPersistence(),
      provider,
      cipher: createCredentialCipher({
        keyVersion: "1",
        keys: { "1": Uint8Array.from({ length: 32 }, () => 7).toBase64() },
      }),
      rateLimiter: createRateLimiter(),
    });
    await expectCode(
      offline.signIn({
        email: "bilal.north@example.test",
        password: fixturePassword,
        sourceAddress: "203.0.113.12",
      }),
      "AUTH_UNAVAILABLE"
    );
  });
});

describe("membership selection", () => {
  it("returns a bounded pending state for an actor with several memberships", async () => {
    const { service } = await createHarness();
    const outcome = await service.signIn({
      email: "amira.north@example.test",
      password: fixturePassword,
      sourceAddress: "203.0.113.20",
    });

    expect(outcome.status).toBe("membership-required");

    if (outcome.status !== "membership-required") {
      return;
    }

    expect(outcome.memberships).toHaveLength(2);
    expect(
      outcome.memberships
        .map((m) => m.tenantName)
        .toSorted((a, b) => a.localeCompare(b))
    ).toStrictEqual(["Northside Elementary", "Southside Middle"]);
  });

  it("selects an own active membership and rotates the credential", async () => {
    const { service } = await createHarness();
    const signIn = await service.signIn({
      email: "amira.north@example.test",
      password: fixturePassword,
      sourceAddress: "203.0.113.21",
    });
    if (signIn.status !== "membership-required") {
      throw new Error("expected a pending membership state");
    }

    const south = signIn.memberships.find(
      (membership) => membership.tenantName === "Southside Middle"
    );
    const selected = await service.selectMembership({
      pendingCredential: signIn.pendingCredential,
      membershipId: south?.membershipId ?? "",
      sourceAddress: "203.0.113.21",
    });

    expect(selected.actor.tenantId).toBe("tenant_school_south");

    const replay = await service.resolveSession(selected.credential);

    expect(replay.status).toBe("active");
  });

  it("refuses a foreign or unknown membership without changing state", async () => {
    const { service } = await createHarness();
    const signIn = await service.signIn({
      email: "amira.north@example.test",
      password: fixturePassword,
      sourceAddress: "203.0.113.22",
    });
    if (signIn.status !== "membership-required") {
      throw new Error("expected a pending membership state");
    }

    await expectCode(
      service.selectMembership({
        pendingCredential: signIn.pendingCredential,
        membershipId: "membership_does_not_exist",
        sourceAddress: "203.0.113.22",
      }),
      "FORBIDDEN"
    );
  });

  it("refuses to replay a consumed pending credential", async () => {
    const { service } = await createHarness();
    const signIn = await service.signIn({
      email: "amira.north@example.test",
      password: fixturePassword,
      sourceAddress: "203.0.113.23",
    });
    if (signIn.status !== "membership-required") {
      throw new Error("expected a pending membership state");
    }
    const [first] = signIn.memberships;
    await service.selectMembership({
      pendingCredential: signIn.pendingCredential,
      membershipId: first?.membershipId ?? "",
      sourceAddress: "203.0.113.23",
    });

    await expectCode(
      service.selectMembership({
        pendingCredential: signIn.pendingCredential,
        membershipId: first?.membershipId ?? "",
        sourceAddress: "203.0.113.23",
      }),
      "UNAUTHENTICATED"
    );
  });

  it("expires a pending credential after five minutes", async () => {
    const { service, advance } = await createHarness();
    const signIn = await service.signIn({
      email: "amira.north@example.test",
      password: fixturePassword,
      sourceAddress: "203.0.113.24",
    });
    if (signIn.status !== "membership-required") {
      throw new Error("expected a pending membership state");
    }
    advance(5 * minute);

    await expectCode(
      service.selectMembership({
        pendingCredential: signIn.pendingCredential,
        membershipId: signIn.memberships[0]?.membershipId ?? "",
        sourceAddress: "203.0.113.24",
      }),
      "UNAUTHENTICATED"
    );
  });
});

describe("session resolution, expiry, and revocation", () => {
  it("resolves a valid credential to the current actor", async () => {
    const { service, outcome } = await activeSession();
    const resolution = await service.resolveSession(outcome.credential);

    expect(resolution.status).toBe("active");
  });

  it("treats a missing or unknown credential as unauthenticated", async () => {
    const { service } = await activeSession();
    const missing = await service.resolveSession(undefined);
    const unknown = await service.resolveSession("not-a-credential");

    expect(missing.status).toBe("unauthenticated");
    expect(unknown.status).toBe("unauthenticated");
  });

  it("expires the session after thirty idle minutes", async () => {
    const { service, outcome, advance } = await activeSession();
    advance(30 * minute);

    const resolved = await service.resolveSession(outcome.credential);

    expect(resolved.status).toBe("unauthenticated");
  });

  it("expires the session at the eight-hour absolute deadline even when active", async () => {
    const { service, outcome, advance } = await activeSession();
    const keepAlive = async (remaining: number): Promise<void> => {
      if (remaining <= 0) {
        return;
      }
      advance(29 * minute);
      await service.continueSession(outcome.credential);
      await keepAlive(remaining - 1);
    };
    await keepAlive(16);
    advance(2 * hour);

    const resolved = await service.resolveSession(outcome.credential);

    expect(resolved.status).toBe("unauthenticated");
  });

  it("advances idle time monotonically without exceeding the absolute deadline", async () => {
    const { service, outcome, advance } = await activeSession();
    advance(10 * minute);
    const continued = await service.continueSession(outcome.credential);

    expect(continued).not.toBeNull();
    expect(Date.parse(continued?.idleExpiresAt ?? "")).toBeLessThanOrEqual(
      Date.parse(continued?.absoluteExpiresAt ?? "")
    );
  });

  it("does not renew on a read", async () => {
    const { service, outcome, advance } = await activeSession();
    advance(10 * minute);
    await service.resolveSession(outcome.credential);
    await service.resolveSession(outcome.credential);
    advance(21 * minute);

    const resolved = await service.resolveSession(outcome.credential);

    expect(resolved.status).toBe("unauthenticated");
  });

  it("revokes locally on logout and refuses a replayed credential", async () => {
    const { service, outcome } = await activeSession();
    const ended = await service.endSession(outcome.credential);

    expect(ended.status).toBe("revoked");

    const replayed = await service.resolveSession(outcome.credential);

    expect(replayed.status).toBe("unauthenticated");
  });

  it("tolerates logout without a live credential", async () => {
    const { service } = await activeSession();
    const anonymous = await service.endSession(undefined);
    const unknown = await service.endSession("unknown");

    expect(anonymous.status).toBe("revoked");
    expect(unknown.status).toBe("revoked");
  });
});

describe("rate limiting", () => {
  it("rejects further sign-in attempts once the account limit is reached", async () => {
    const { service } = await createHarness({ signInAttemptLimit: 2 });
    const attempt = () => {
      return service.signIn({
        email: "bilal.north@example.test",
        password: "wrong-password",
        sourceAddress: "203.0.113.40",
      });
    };

    await expectCode(attempt(), "UNAUTHENTICATED");
    await expectCode(attempt(), "UNAUTHENTICATED");
    await expectCode(attempt(), "RATE_LIMITED");
  });
});

describe("teacher sign-up", () => {
  it("returns one verification-pending state and creates no session", async () => {
    const { service, persistence } = await createHarness();
    const outcome = await service.signUpTeacher({
      email: "new.teacher@example.test",
      password: "a-good-enough-password",
      sourceAddress: "203.0.113.50",
    });

    expect(outcome.status).toBe("verification-pending");

    const duplicate = await service.signUpTeacher({
      email: "new.teacher@example.test",
      password: "a-good-enough-password",
      sourceAddress: "203.0.113.50",
    });

    expect(duplicate).toStrictEqual(outcome);

    const binding = await persistence.findProviderBinding(
      issuer,
      "subject_teacher_amira"
    );

    expect(binding).toBeDefined();
  });
});
