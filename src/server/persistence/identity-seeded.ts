import { IdentityError } from "../identity/errors";
import type {
  ActorRecord,
  IdentityPersistence,
  ProvisioningAuditEntry,
} from "../identity/persistence-port";
import type { ClassId } from "../identity/identifiers";
import type { ServerObservability } from "../observability.server";
import type {
  IdentitySessionRecord,
  MembershipRecord,
  PendingAuthenticationRecord,
  ProviderBindingRecord,
} from "../identity/types";

export interface SeededIdentityStore {
  readonly actors: Map<string, ActorRecord>;
  readonly providerBindings: Map<string, ProviderBindingRecord>;
  readonly memberships: Map<string, MembershipRecord>;
  readonly classAssignments: Map<string, ClassId[]>;
  readonly tenantNames: Map<string, string>;
  readonly sessions: Map<string, IdentitySessionRecord>;
  readonly sessionVerifiers: Map<string, string>;
  readonly pendingAuthentications: Map<string, PendingAuthenticationRecord>;
  readonly pendingVerifiers: Map<string, string>;
  readonly provisioningAudit: ProvisioningAuditEntry[];
}

export const createSeededIdentityStore = (): SeededIdentityStore => {
  return {
    actors: new Map(),
    providerBindings: new Map(),
    memberships: new Map(),
    classAssignments: new Map(),
    tenantNames: new Map(),
    sessions: new Map(),
    sessionVerifiers: new Map(),
    pendingAuthentications: new Map(),
    pendingVerifiers: new Map(),
    provisioningAudit: [],
  };
};

export interface SeededIdentityPersistenceOptions {
  store?: SeededIdentityStore;
  observability?: ServerObservability;
}

const bindingKey = (issuer: string, subject: string): string =>
  `${issuer}\0${subject}`;

export const createSeededIdentityPersistence = (
  options: SeededIdentityPersistenceOptions = {}
): IdentityPersistence => {
  const store = options.store ?? createSeededIdentityStore();

  const readSession = (
    sessionId: string
  ): IdentitySessionRecord | undefined => {
    const session = store.sessions.get(sessionId);
    return session ? structuredClone(session) : undefined;
  };

  const readSessionByVerifier = (
    verifierHash: string
  ): IdentitySessionRecord | undefined => {
    const sessionId = store.sessionVerifiers.get(verifierHash);
    return sessionId !== undefined && sessionId !== ""
      ? readSession(sessionId)
      : undefined;
  };

  const updateSession = (
    sessionId: string,
    expectedRevision: number,
    mutate: (session: IdentitySessionRecord) => IdentitySessionRecord
  ): IdentitySessionRecord | undefined => {
    const session = store.sessions.get(sessionId);
    if (
      session === undefined ||
      (session.revokedAt !== undefined && session.revokedAt !== "") ||
      session.revision !== expectedRevision
    ) {
      return undefined;
    }
    const updated = mutate(session);
    store.sessions.set(sessionId, updated);
    return updated;
  };

  return {
    findProviderBinding: async (issuer, subject) => {
      const binding = store.providerBindings.get(bindingKey(issuer, subject));
      return await Promise.resolve(
        binding ? structuredClone(binding) : undefined
      );
    },

    createProviderBinding: async (binding) => {
      const existing = store.providerBindings.get(
        bindingKey(binding.providerIssuer, binding.providerSubject)
      );
      if (existing) {
        return existing.actorId === binding.actorId
          ? await Promise.resolve(structuredClone(existing))
          : await Promise.reject(new IdentityError("CONFLICT"));
      }

      const isActorAlreadyBound = store.providerBindings
        .values()
        .some((candidate) => {
          return (
            candidate.actorId === binding.actorId &&
            candidate.providerIssuer === binding.providerIssuer
          );
        });
      if (isActorAlreadyBound) {
        throw new IdentityError("CONFLICT");
      }

      store.providerBindings.set(
        bindingKey(binding.providerIssuer, binding.providerSubject),
        structuredClone(binding)
      );
      return structuredClone(binding);
    },

    readActor: async (actorId) => {
      const actor = store.actors.get(actorId);
      return await Promise.resolve(actor ? structuredClone(actor) : undefined);
    },

    createActor: async (input) => {
      const existing = store.actors.get(input.actorId);
      if (existing) {
        return await Promise.resolve(structuredClone(existing));
      }
      const actor: ActorRecord = {
        actorId: input.actorId,
        displayName: input.displayName,
        isActive: input.isActive ?? true,
        authorizationRevision: 1,
      };
      store.actors.set(input.actorId, actor);
      return structuredClone(actor);
    },

    listMemberships: async (actorId) => {
      const memberships = store.memberships
        .values()
        .filter((membership) => membership.actorId === actorId)
        .map((membership) => structuredClone(membership))
        .toArray();
      return await Promise.resolve(memberships);
    },

    readMembership: async (membershipId) => {
      const membership = store.memberships.get(membershipId);
      return await Promise.resolve(
        membership ? structuredClone(membership) : undefined
      );
    },

    readTenantName: async (tenantId) =>
      await Promise.resolve(store.tenantNames.get(tenantId)),

    listRosterClassIds: async (membershipId) => {
      const classIds = store.classAssignments.get(membershipId) ?? [];
      return await Promise.resolve(structuredClone(classIds));
    },

    grantMembership: async (input) => {
      const existing = store.memberships.values().find((membership) => {
        return (
          membership.actorId === input.actorId &&
          membership.tenantId === input.tenantId &&
          membership.role === input.role
        );
      });
      if (existing) {
        return await Promise.resolve(structuredClone(existing));
      }
      const membership: MembershipRecord = {
        membershipId: input.membershipId,
        actorId: input.actorId,
        tenantId: input.tenantId,
        tenantName: input.tenantName,
        role: input.role,
        status: "active",
        revision: 1,
        ...(input.learner && { learnerId: input.learner.id }),
      };
      store.memberships.set(input.membershipId, membership);
      return structuredClone(membership);
    },

    assignClass: async (input) => {
      const classIds = store.classAssignments.get(input.membershipId) ?? [];
      if (!classIds.includes(input.classId)) {
        store.classAssignments.set(input.membershipId, [
          ...classIds,
          input.classId,
        ]);
      }
      await Promise.resolve();
    },

    revokeMembership: async (membershipId) => {
      const membership = store.memberships.get(membershipId);
      if (!membership || membership.status === "revoked") {
        return await Promise.resolve(false);
      }
      store.memberships.set(membershipId, {
        ...membership,
        status: "revoked",
        revision: membership.revision + 1,
      });
      return true;
    },

    disableActor: async (actorId) => {
      const actor = store.actors.get(actorId);
      if (!actor) {
        return await Promise.resolve(false);
      }
      store.actors.set(actorId, {
        ...actor,
        isActive: false,
        authorizationRevision: actor.authorizationRevision + 1,
      });
      const now = new Date();
      const revokedAt = now.toISOString();
      for (const [sessionId, session] of store.sessions) {
        if (
          session.actorId === actorId &&
          (session.revokedAt === undefined || session.revokedAt === "")
        ) {
          store.sessions.set(sessionId, {
            ...session,
            revokedAt,
            revision: session.revision + 1,
          });
        }
      }
      return true;
    },

    createSession: async (input) => {
      const session: IdentitySessionRecord = {
        sessionId: input.sessionId,
        verifierHash: input.verifierHash,
        actorId: input.actorId,
        membershipId: input.membershipId,
        tenantId: input.tenantId,
        providerSessionId: input.providerSessionId,
        providerSubject: input.providerSubject,
        sessionGeneration: input.sessionGeneration,
        authorizationRevision: input.authorizationRevision,
        revision: 1,
        createdAt: input.createdAt,
        lastActivityAt: input.lastActivityAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
        ...(input.providerCredentialsCiphertext !== undefined &&
          input.providerCredentialsCiphertext !== "" && {
            providerCredentialsCiphertext: input.providerCredentialsCiphertext,
          }),
      };
      store.sessions.set(session.sessionId, session);
      store.sessionVerifiers.set(session.verifierHash, session.sessionId);
      await Promise.resolve();
    },

    readSessionByVerifier: async (verifierHash) =>
      await Promise.resolve(readSessionByVerifier(verifierHash)),

    readSession: async (sessionId) =>
      await Promise.resolve(readSession(sessionId)),

    touchSession: async (update) => {
      const updated = updateSession(
        update.sessionId,
        update.expectedRevision,
        (session) => {
          return {
            ...session,
            lastActivityAt: update.lastActivityAt,
            revision: session.revision + 1,
          };
        }
      );
      return await Promise.resolve(updated !== undefined);
    },

    rotateSessionCredentials: async (replacement) => {
      const updated = updateSession(
        replacement.sessionId,
        replacement.expectedRevision,
        (session) => {
          return {
            ...session,
            providerCredentialsCiphertext:
              replacement.providerCredentialsCiphertext,
            revision: session.revision + 1,
          };
        }
      );
      return await Promise.resolve(updated !== undefined);
    },

    revokeSession: async (sessionId, revokedAt) => {
      const session = store.sessions.get(sessionId);
      const revoked: IdentitySessionRecord | undefined =
        session !== undefined &&
        (session.revokedAt === undefined || session.revokedAt === "")
          ? {
              ...session,
              revokedAt,
              revision: session.revision + 1,
            }
          : undefined;
      if (revoked) {
        store.sessions.set(sessionId, revoked);
      }
      return await Promise.resolve(
        revoked ? structuredClone(revoked) : undefined
      );
    },

    createPendingAuthentication: async (record) => {
      store.pendingAuthentications.set(
        record.pendingId,
        structuredClone(record)
      );
      store.pendingVerifiers.set(record.verifierHash, record.pendingId);
      await Promise.resolve();
    },

    readPendingAuthentication: async (verifierHash) => {
      const pendingId = store.pendingVerifiers.get(verifierHash);
      const pending =
        pendingId === undefined || pendingId === ""
          ? undefined
          : store.pendingAuthentications.get(pendingId);
      return await Promise.resolve(
        pending === undefined ? undefined : structuredClone(pending)
      );
    },

    consumePendingAuthentication: async (pendingId, consumedAt) => {
      const pending = store.pendingAuthentications.get(pendingId);
      if (
        pending === undefined ||
        (pending.consumedAt !== undefined && pending.consumedAt !== "")
      ) {
        return await Promise.resolve(false);
      }
      store.pendingAuthentications.set(pendingId, { ...pending, consumedAt });
      return true;
    },

    appendProvisioningAudit: async (entry) => {
      store.provisioningAudit.push(structuredClone(entry));
      await Promise.resolve();
    },
  };
};
