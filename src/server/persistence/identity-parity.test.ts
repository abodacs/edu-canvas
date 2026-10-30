import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  parseActorId,
  parseClassId,
  parseMembershipId,
  parseTenantId,
} from "../identity/identifiers";
import { createPostgresIdentityPersistence } from "./identity-postgres";
import {
  createSeededIdentityPersistence,
  createSeededIdentityStore,
} from "./identity-seeded";
import type {
  ActorId,
  ClassId,
  MembershipId,
  TenantId,
} from "../identity/identifiers";
import type { IdentityPersistence } from "../identity/persistence-port";

const databaseUrl = process.env.DATABASE_URL;
const isDatabaseTestsEnabled = process.env.RUN_DATABASE_TESTS === "true";
const isRunDatabaseTests = Boolean(databaseUrl && isDatabaseTestsEnabled);

const requireDatabaseUrl = (): string => {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set for database contract tests.");
  }
  return databaseUrl;
};

const runId = randomUUID();
const seededStore = createSeededIdentityStore();

interface IdentityFixture {
  readonly prefix: string;
  readonly tenantId: TenantId;
  readonly tenantName: string;
  readonly actorId: ActorId;
  readonly membershipId: MembershipId;
  readonly classId: ClassId;
}

interface IdentityAdapter {
  readonly name: string;
  readonly create: () => IdentityPersistence;
  readonly setupFixture: (suffix: string) => Promise<IdentityFixture>;
  readonly cleanupFixture: (fixture: IdentityFixture) => Promise<void>;
}

const fixtureIds = (prefix: string, suffix: string) => {
  return {
    prefix,
    tenantId: parseTenantId(`${prefix}_tenant`),
    tenantName: `Issue 98 ${suffix} school`,
    actorId: parseActorId(`${prefix}_teacher`),
    membershipId: parseMembershipId(`${prefix}_membership`),
    classId: parseClassId(`${prefix}_class`),
  };
};

const withRawDatabase = async <T>(
  work: (sql: ReturnType<typeof postgres>) => Promise<T>
): Promise<T> => {
  const sql = postgres(requireDatabaseUrl(), { max: 1, prepare: false });

  try {
    return await work(sql);
  } finally {
    await sql.end({ timeout: 3 });
  }
};

const provisionFixture = async (
  persistence: IdentityPersistence,
  fixture: IdentityFixture
): Promise<void> => {
  await persistence.createActor({
    actorId: fixture.actorId,
    displayName: `Issue 98 ${fixture.prefix}`,
  });
  await persistence.grantMembership({
    membershipId: fixture.membershipId,
    actorId: fixture.actorId,
    tenantId: fixture.tenantId,
    tenantName: fixture.tenantName,
    role: "teacher",
  });
  await persistence.assignClass({
    membershipId: fixture.membershipId,
    classId: fixture.classId,
    tenantId: fixture.tenantId,
  });
};

const insertTenantRow = async (fixture: IdentityFixture): Promise<void> => {
  await withRawDatabase(async (sql) => {
    await sql.begin(async (transaction) => {
      await transaction`
        select set_config('app.tenant_id', ${fixture.tenantId}, true)
      `;
      await transaction`
        insert into tenants (id, slug, name, synthetic_data_only)
        values (
          ${fixture.tenantId},
          ${fixture.tenantId},
          ${fixture.tenantName},
          true
        )
      `;
    });
  });
};

const deleteFixtureRows = async (fixture: IdentityFixture): Promise<void> => {
  const { prefix } = fixture;
  await withRawDatabase(async (sql) => {
    await sql.begin(async (transaction) => {
      await transaction`
        select set_config('app.tenant_id', ${fixture.tenantId}, true)
      `;
      await transaction`
        delete from identity_sessions
        where starts_with(session_id, ${prefix})
          or starts_with(actor_id, ${prefix})
      `;
      await transaction`
        delete from pending_authentications
        where starts_with(pending_id, ${prefix})
          or starts_with(actor_id, ${prefix})
      `;
      await transaction`
        delete from class_assignments where starts_with(tenant_id, ${prefix})
      `;
      await transaction`
        delete from memberships
        where starts_with(tenant_id, ${prefix})
          or starts_with(actor_id, ${prefix})
      `;
      await transaction`
        delete from provider_bindings where starts_with(actor_id, ${prefix})
      `;
      await transaction`delete from actors where starts_with(id, ${prefix})`;
      await transaction`
        delete from provisioning_audit where starts_with(request_id, ${prefix})
      `;
      await transaction`delete from tenants where starts_with(id, ${prefix})`;
    });
  });
};

const resetSeededStore = (): void => {
  seededStore.actors.clear();
  seededStore.providerBindings.clear();
  seededStore.memberships.clear();
  seededStore.classAssignments.clear();
  seededStore.tenantNames.clear();
  seededStore.sessions.clear();
  seededStore.sessionVerifiers.clear();
  seededStore.pendingAuthentications.clear();
  seededStore.pendingVerifiers.clear();
  seededStore.provisioningAudit.length = 0;
};

const seededAdapter: IdentityAdapter = {
  name: "seeded",
  create: () => createSeededIdentityPersistence({ store: seededStore }),
  setupFixture: async (suffix) => {
    const fixture = fixtureIds(`issue98_${runId}_${suffix}`, suffix);
    seededStore.tenantNames.set(fixture.tenantId, fixture.tenantName);
    await provisionFixture(
      createSeededIdentityPersistence({ store: seededStore }),
      fixture
    );
    return fixture;
  },
  cleanupFixture: () => {
    resetSeededStore();
    return Promise.resolve();
  },
};

const postgresAdapter: IdentityAdapter = {
  name: "postgres",
  create: () => createPostgresIdentityPersistence(requireDatabaseUrl()),
  setupFixture: async (suffix) => {
    const fixture = fixtureIds(`issue98_${runId}_${suffix}`, suffix);
    await insertTenantRow(fixture);
    await provisionFixture(
      createPostgresIdentityPersistence(requireDatabaseUrl()),
      fixture
    );
    return fixture;
  },
  cleanupFixture: (fixture) => deleteFixtureRows(fixture),
};

const adapters: readonly IdentityAdapter[] = [seededAdapter, postgresAdapter];

const createSessionForFixture = async (
  persistence: IdentityPersistence,
  fixture: IdentityFixture,
  suffix: string
): Promise<{ readonly sessionId: string; readonly verifierHash: string }> => {
  const sessionId = `${fixture.prefix}_${suffix}_session`;
  const verifierHash = `${fixture.prefix}_${suffix}_verifier`;
  await persistence.createSession({
    sessionId,
    verifierHash,
    actorId: fixture.actorId,
    membershipId: fixture.membershipId,
    tenantId: fixture.tenantId,
    providerSessionId: `${fixture.prefix}_${suffix}_provider_session`,
    providerSubject: `${fixture.prefix}_${suffix}_provider_subject`,
    sessionGeneration: `${fixture.prefix}_${suffix}_generation`,
    authorizationRevision: 1,
    createdAt: "2026-10-28T00:00:00.000Z",
    lastActivityAt: "2026-10-28T00:00:00.000Z",
    absoluteExpiresAt: "2026-10-28T08:00:00.000Z",
  });
  return { sessionId, verifierHash };
};

describe.skipIf(!isRunDatabaseTests)("identity persistence parity", () => {
  describe.each(adapters)("$name adapter", (adapter) => {
    const fixture: IdentityFixture = fixtureIds(
      `issue98_${runId}_${adapter.name}`,
      adapter.name
    );

    beforeAll(async () => {
      await adapter.setupFixture(adapter.name);
    });

    afterAll(async () => {
      await adapter.cleanupFixture(fixture);
    });

    it("creates a session readable by verifier and by id", async () => {
      const persistence = adapter.create();
      const { sessionId, verifierHash } = await createSessionForFixture(
        persistence,
        fixture,
        "lifecycle"
      );

      const created = await persistence.readSessionByVerifier(verifierHash);

      expect(created).toMatchObject({
        sessionId,
        actorId: fixture.actorId,
        membershipId: fixture.membershipId,
        tenantId: fixture.tenantId,
        providerSubject: `${fixture.prefix}_lifecycle_provider_subject`,
        revision: 1,
      });
      expect(created?.revokedAt).toBeUndefined();

      const byId = await persistence.readSession(sessionId);

      expect(byId?.sessionId).toBe(sessionId);
    });

    it("revokes a session idempotently", async () => {
      const persistence = adapter.create();
      const { sessionId, verifierHash } = await createSessionForFixture(
        persistence,
        fixture,
        "revoke"
      );

      const revoked = await persistence.revokeSession(
        sessionId,
        "2026-10-28T01:00:00.000Z"
      );

      expect(revoked).toMatchObject({
        sessionId,
        revokedAt: "2026-10-28T01:00:00.000Z",
        revision: 2,
      });

      const afterRevoke = await persistence.readSessionByVerifier(verifierHash);

      expect(afterRevoke?.revokedAt).toBe("2026-10-28T01:00:00.000Z");

      await expect(
        persistence.revokeSession(sessionId, "2026-10-28T01:05:00.000Z")
      ).resolves.toBeUndefined();
    });

    it("advances activity only on the expected revision", async () => {
      const persistence = adapter.create();
      const { sessionId } = await createSessionForFixture(
        persistence,
        fixture,
        "activity"
      );

      await expect(
        persistence.touchSession({
          sessionId,
          expectedRevision: 99,
          lastActivityAt: "2026-10-28T00:30:00.000Z",
        })
      ).resolves.toBeFalsy();

      await expect(
        persistence.touchSession({
          sessionId,
          expectedRevision: 1,
          lastActivityAt: "2026-10-28T00:30:00.000Z",
        })
      ).resolves.toBeTruthy();

      const touched = await persistence.readSession(sessionId);

      expect(touched?.lastActivityAt).toBe("2026-10-28T00:30:00.000Z");
      expect(touched?.revision).toBe(2);
    });

    it("rotates credentials only on the expected revision", async () => {
      const persistence = adapter.create();
      const { sessionId } = await createSessionForFixture(
        persistence,
        fixture,
        "rotation"
      );

      await expect(
        persistence.rotateSessionCredentials({
          sessionId,
          expectedRevision: 99,
          providerCredentialsCiphertext: "stale",
        })
      ).resolves.toBeFalsy();
      await expect(
        persistence.rotateSessionCredentials({
          sessionId,
          expectedRevision: 1,
          providerCredentialsCiphertext: "rotated-ciphertext",
        })
      ).resolves.toBeTruthy();

      const rotated = await persistence.readSession(sessionId);

      expect(rotated?.providerCredentialsCiphertext).toBe("rotated-ciphertext");
      expect(rotated?.revision).toBe(2);
    });

    it("refuses to touch a revoked session", async () => {
      const persistence = adapter.create();
      const { sessionId } = await createSessionForFixture(
        persistence,
        fixture,
        "revoked-touch"
      );

      await persistence.revokeSession(sessionId, "2026-10-28T02:00:00.000Z");

      await expect(
        persistence.touchSession({
          sessionId,
          expectedRevision: 1,
          lastActivityAt: "2026-10-28T03:00:00.000Z",
        })
      ).resolves.toBeFalsy();
    });

    it("rejects conflicting provider rebinding and keeps the original binding", async () => {
      const persistence = adapter.create();
      const issuer = `${fixture.prefix}_issuer`;
      const subject = `${fixture.prefix}_subject`;
      const otherActorId = parseActorId(`${fixture.prefix}_other_actor`);
      await persistence.createActor({
        actorId: otherActorId,
        displayName: "Conflicting actor",
      });

      const binding = await persistence.createProviderBinding({
        providerIssuer: issuer,
        providerSubject: subject,
        actorId: fixture.actorId,
        createdAt: "2026-10-28T00:00:00.000Z",
      });

      expect(binding.actorId).toBe(fixture.actorId);

      const replay = await persistence.createProviderBinding({
        providerIssuer: issuer,
        providerSubject: subject,
        actorId: fixture.actorId,
        createdAt: "2026-10-28T00:10:00.000Z",
      });

      expect(replay.actorId).toBe(fixture.actorId);

      await expect(
        persistence.createProviderBinding({
          providerIssuer: issuer,
          providerSubject: subject,
          actorId: otherActorId,
          createdAt: "2026-10-28T00:20:00.000Z",
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });

      await expect(
        persistence.createProviderBinding({
          providerIssuer: issuer,
          providerSubject: `${subject}_second`,
          actorId: fixture.actorId,
          createdAt: "2026-10-28T00:30:00.000Z",
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });

      const stored = await persistence.findProviderBinding(issuer, subject);

      expect(stored?.actorId).toBe(fixture.actorId);
    });

    it("lists memberships and roster classes for the actor", async () => {
      const persistence = adapter.create();

      const memberships = await persistence.listMemberships(fixture.actorId);
      const membership = memberships.find(
        (candidate) => candidate.membershipId === fixture.membershipId
      );

      expect(membership).toMatchObject({
        role: "teacher",
        status: "active",
        tenantName: fixture.tenantName,
        revision: 1,
      });

      const read = await persistence.readMembership(fixture.membershipId);

      expect(read?.membershipId).toBe(fixture.membershipId);

      const roster = await persistence.listRosterClassIds(fixture.membershipId);

      expect(roster).toStrictEqual([fixture.classId]);

      await expect(persistence.readTenantName(fixture.tenantId)).resolves.toBe(
        fixture.tenantName
      );
    });

    it("revokes a membership conditionally", async () => {
      const persistence = adapter.create();
      const actorId = parseActorId(`${fixture.prefix}_revoke_actor`);
      const membershipId = parseMembershipId(
        `${fixture.prefix}_revoke_membership`
      );
      await persistence.createActor({
        actorId,
        displayName: "Revoke actor",
      });
      await persistence.grantMembership({
        membershipId,
        actorId,
        tenantId: fixture.tenantId,
        tenantName: fixture.tenantName,
        role: "teacher",
      });

      await expect(
        persistence.revokeMembership(membershipId)
      ).resolves.toBeTruthy();
      await expect(
        persistence.revokeMembership(membershipId)
      ).resolves.toBeFalsy();

      const revoked = await persistence.readMembership(membershipId);

      expect(revoked).toMatchObject({ status: "revoked", revision: 2 });
    });

    it("disables an actor and revokes its sessions", async () => {
      const persistence = adapter.create();
      const actorId = parseActorId(`${fixture.prefix}_disable_actor`);
      const membershipId = parseMembershipId(
        `${fixture.prefix}_disable_membership`
      );
      await persistence.createActor({
        actorId,
        displayName: "Disable actor",
      });
      await persistence.grantMembership({
        membershipId,
        actorId,
        tenantId: fixture.tenantId,
        tenantName: fixture.tenantName,
        role: "teacher",
      });
      const sessionId = `${fixture.prefix}_disable_session`;
      const verifierHash = `${fixture.prefix}_disable_verifier`;
      await persistence.createSession({
        sessionId,
        verifierHash,
        actorId,
        membershipId,
        tenantId: fixture.tenantId,
        providerSessionId: `${fixture.prefix}_disable_provider_session`,
        providerSubject: `${fixture.prefix}_disable_provider_subject`,
        sessionGeneration: `${fixture.prefix}_disable_generation`,
        authorizationRevision: 1,
        createdAt: "2026-10-28T00:00:00.000Z",
        lastActivityAt: "2026-10-28T00:00:00.000Z",
        absoluteExpiresAt: "2026-10-28T08:00:00.000Z",
      });

      await expect(persistence.disableActor(actorId)).resolves.toBeTruthy();

      const actor = await persistence.readActor(actorId);

      expect(actor?.isActive).toBeFalsy();
      expect(actor?.authorizationRevision).toBe(2);

      const session = await persistence.readSessionByVerifier(verifierHash);

      expect(session?.revokedAt).toBeDefined();
    });

    it("stores, reads, and consumes a pending authentication", async () => {
      const persistence = adapter.create();
      const pendingId = `${fixture.prefix}_pending`;
      const verifierHash = `${fixture.prefix}_pending_verifier`;
      await persistence.createPendingAuthentication({
        pendingId,
        verifierHash,
        actorId: fixture.actorId,
        memberships: [
          {
            membershipId: fixture.membershipId,
            tenantName: fixture.tenantName,
            role: "teacher",
          },
        ],
        providerSessionId: `${fixture.prefix}_pending_provider_session`,
        providerSubject: `${fixture.prefix}_pending_provider_subject`,
        providerCredentialsCiphertext: "pending-ciphertext",
        createdAt: "2026-10-28T00:00:00.000Z",
        expiresAt: "2026-10-28T00:05:00.000Z",
      });

      const pending = await persistence.readPendingAuthentication(verifierHash);

      expect(pending).toMatchObject({
        pendingId,
        actorId: fixture.actorId,
        providerSubject: `${fixture.prefix}_pending_provider_subject`,
      });
      expect(pending?.memberships).toStrictEqual([
        {
          membershipId: fixture.membershipId,
          tenantName: fixture.tenantName,
          role: "teacher",
        },
      ]);

      await expect(
        persistence.consumePendingAuthentication(
          pendingId,
          "2026-10-28T00:01:00.000Z"
        )
      ).resolves.toBeTruthy();
      await expect(
        persistence.consumePendingAuthentication(
          pendingId,
          "2026-10-28T00:02:00.000Z"
        )
      ).resolves.toBeFalsy();

      const consumed =
        await persistence.readPendingAuthentication(verifierHash);

      expect(consumed?.consumedAt).toBe("2026-10-28T00:01:00.000Z");
    });

    it("returns nothing for an unknown verifier before a tenant is known", async () => {
      const persistence = adapter.create();
      const unknownVerifier = `${fixture.prefix}_unknown_verifier`;

      await expect(
        persistence.readSessionByVerifier(unknownVerifier)
      ).resolves.toBeUndefined();
      await expect(
        persistence.readPendingAuthentication(unknownVerifier)
      ).resolves.toBeUndefined();
    });

    it("appends a provisioning audit entry", async () => {
      const persistence = adapter.create();

      await expect(
        persistence.appendProvisioningAudit({
          operation: "grantMembership",
          principal: "service:issue-98",
          targetId: fixture.membershipId,
          result: "succeeded",
          requestId: `${fixture.prefix}_audit_request`,
          at: "2026-10-28T00:00:00.000Z",
        })
      ).resolves.toBeUndefined();
    });
  });
});
