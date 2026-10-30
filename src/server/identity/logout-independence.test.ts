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

const password = syntheticPasswordForTests;

describe("local logout independence", () => {
  it("completes the local revocation when the provider sign-out rejects", async () => {
    const persistence = createSeededIdentityPersistence({
      store: createSeededIdentityStore(),
    });
    await ensureSyntheticIdentityFixture(persistence);

    const inner = createDeterministicIdentityProvider({
      issuer: syntheticProviderIssuer,
      accounts: syntheticAccounts,
    });
    const service = createIdentityService({
      persistence,
      provider: {
        ...inner,
        signOut: () => Promise.reject(new Error("provider logout outage")),
      },
      cipher: createCredentialCipher({
        keyVersion: "1",
        keys: { "1": Uint8Array.from({ length: 32 }, () => 7).toBase64() },
      }),
      rateLimiter: createRateLimiter(),
    });

    const signIn = await service.signIn({
      email: "bilal.north@example.test",
      password,
      sourceAddress: "203.0.113.111",
    });
    // The fixture teachers also hold the curriculum classroom membership, so the
    // harness completes the designed selection with it before anything else.
    const signedIn =
      signIn.status === "membership-required"
        ? await service.selectMembership({
            pendingCredential: signIn.pendingCredential,
            membershipId:
              signIn.memberships.find(
                (option) =>
                  option.tenantName === "Edu-Canvas Synthetic Classroom"
              )?.membershipId ?? "",
            sourceAddress: "203.0.113.111",
          })
        : signIn;
    if (signedIn.status !== "active") {
      throw new Error("expected an active session");
    }

    const ended = await service.endSession(signedIn.credential);
    const replay = await service.resolveSession(signedIn.credential);

    expect({ ended: ended.status, replay: replay.status }).toStrictEqual({
      ended: "revoked",
      replay: "unauthenticated",
    });
  });
});
