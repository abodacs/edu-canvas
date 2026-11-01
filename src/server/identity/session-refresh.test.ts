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

import type { DeterministicIdentityProvider } from "./provider/deterministic";
import type { IdentityProvider, ProviderRefreshOutcome } from "./provider/port";
import type { IdentityService } from "./service";

const password = syntheticPasswordForTests;
const email = "bilal.north@example.test";

const createCipher = () => {
  return createCredentialCipher({
    keyVersion: "1",
    keys: { "1": Uint8Array.from({ length: 32 }, () => 7).toBase64() },
  });
};

interface HarnessOptions {
  /**
  Replace the refresh outcome, so one branch of the refresh path can run.
  */
  readonly refreshOutcome?: ProviderRefreshOutcome;
  /**
  Revoke the session while the refresh is in flight, as a logout would.
  */
  readonly revokeDuringRefresh?: boolean;
}

interface Harness {
  readonly service: IdentityService;
  readonly provider: DeterministicIdentityProvider;
  readonly credential: string;
  readonly sessionId: string;
  readonly credentialsBefore: string | undefined;
  readonly credentialsAfterExpiry: () => Promise<string | undefined>;
  readonly revisionAfterExpiry: () => Promise<number>;
}

const createHarness = async (
  options: HarnessOptions = {}
): Promise<Harness> => {
  const persistence = createSeededIdentityPersistence({
    store: createSeededIdentityStore(),
  });
  await ensureSyntheticIdentityFixture(persistence);

  const inner = createDeterministicIdentityProvider({
    issuer: syntheticProviderIssuer,
    accounts: syntheticAccounts,
  });
  const barrier = { sessionId: "" };

  let provider: IdentityProvider = inner;
  if (options.refreshOutcome) {
    const outcome = options.refreshOutcome;
    provider = { ...inner, refresh: () => Promise.resolve(outcome) };
  } else if (options.revokeDuringRefresh) {
    provider = {
      ...inner,
      refresh: async (refreshToken) => {
        // A concurrent logout commits before the refresh replaces credentials.
        const revokedAt = new Date();
        await persistence.revokeSession(
          barrier.sessionId,
          revokedAt.toISOString()
        );
        return inner.refresh(refreshToken);
      },
    };
  }

  const service = createIdentityService({
    persistence,
    provider,
    cipher: createCipher(),
    rateLimiter: createRateLimiter(),
  });

  const signIn = await service.signIn({
    email,
    password,
    sourceAddress: "203.0.113.90",
  });
  // The fixture teachers also hold the curriculum classroom membership, so the
  // harness completes the designed selection with it before anything else.
  const signedIn =
    signIn.status === "membership-required"
      ? await service.selectMembership({
          pendingCredential: signIn.pendingCredential,
          membershipId:
            signIn.memberships.find(
              (option) => option.tenantName === "Grade 4S · Synthetic Fractions"
            )?.membershipId ?? "",
          sourceAddress: "203.0.113.90",
        })
      : signIn;
  if (signedIn.status !== "active") {
    throw new Error("expected an active session");
  }
  barrier.sessionId = signedIn.session.sessionId;

  const readStored = () => persistence.readSession(signedIn.session.sessionId);

  return {
    service,
    provider: inner,
    credential: signedIn.credential,
    sessionId: signedIn.session.sessionId,
    credentialsBefore: signedIn.session.providerCredentialsCiphertext,
    credentialsAfterExpiry: async () => {
      const stored = await readStored();
      return stored?.providerCredentialsCiphertext;
    },
    revisionAfterExpiry: async () => {
      const stored = await readStored();
      return stored?.revision ?? 0;
    },
  };
};

describe("bounded internal credential refresh", () => {
  it("refreshes an expired provider token and keeps the session active", async () => {
    const harness = await createHarness();
    const revisionBefore = await harness.revisionAfterExpiry();

    harness.provider.expireAccessTokens();
    const resolution = await harness.service.resolveSession(harness.credential);

    expect({
      status: resolution.status,
      credentialsReplaced:
        (await harness.credentialsAfterExpiry()) !== harness.credentialsBefore,
      revisionAdvanced: (await harness.revisionAfterExpiry()) > revisionBefore,
    }).toStrictEqual({
      status: "active",
      credentialsReplaced: true,
      revisionAdvanced: true,
    });
  });

  it("ends the local session when the provider rejects the refresh token", async () => {
    const harness = await createHarness({
      refreshOutcome: { status: "invalid" },
    });

    harness.provider.expireAccessTokens();
    const resolution = await harness.service.resolveSession(harness.credential);

    expect(resolution.status).toBe("unauthenticated");
    await expect(
      harness.service.resolveSession(harness.credential)
    ).resolves.toStrictEqual({ status: "unauthenticated" });
  });

  it("fails closed without ending the session while the provider is unavailable", async () => {
    const harness = await createHarness({
      refreshOutcome: { status: "unavailable" },
    });

    harness.provider.expireAccessTokens();
    const resolution = await harness.service.resolveSession(harness.credential);

    expect(resolution.status).toBe("unavailable");
    await expect(
      harness.service.continueSession(harness.credential)
    ).resolves.toBeNull();
  });

  it("discards late credentials when logout wins the revision check", async () => {
    const harness = await createHarness({ revokeDuringRefresh: true });

    harness.provider.expireAccessTokens();
    const resolution = await harness.service.resolveSession(harness.credential);

    expect({
      status: resolution.status,
      credentialsUnchanged:
        (await harness.credentialsAfterExpiry()) === harness.credentialsBefore,
    }).toStrictEqual({ status: "unauthenticated", credentialsUnchanged: true });
  });
});
