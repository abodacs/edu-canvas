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

/**
 * The in-memory identity store. The caller owns it (the same module-level store
 * pattern `src/server/persistence.ts` uses for generation) so a seeded
 * deployment and its tests share one deterministic repository.
 */
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
    return sessionId ? readSession(sessionId) : undefined;
  };

  const updateSession = (
    sessionId: string,
    expectedRevision: number,
    mutate: (session: IdentitySessionRecord) => IdentitySessionRecord
  ): IdentitySessionRecord | undefined => {
    const session = store.sessions.get(sessionId);
    if (
      !session ||
      session.revokedAt ||
      session.revision !== expectedRevision
    ) {
      return undefined;
    }
    const updated = mutate(session);
    store.sessions.set(sessionId, updated);
    return updated;
  };

  return {
    kind: "seeded-demo",

    findProviderBinding: (issuer, subject) => {
      const binding = store.providerBindings.get(bindingKey(issuer, subject));
      return Promise.resolve(binding ? structuredClone(binding) : undefined);
    },

    createProviderBinding: (binding) => {
      const existing = store.providerBindings.get(
        bindingKey(binding.providerIssuer, binding.providerSubject)
      );
      if (existing) {
        return existing.actorId === binding.actorId
          ? Promise.resolve(structuredClone(existing))
          : Promise.reject(new IdentityError("CONFLICT"));
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
        return Promise.reject(new IdentityError("CONFLICT"));
      }

      store.providerBindings.set(
        bindingKey(binding.providerIssuer, binding.providerSubject),
        structuredClone(binding)
      );
      return Promise.resolve(structuredClone(binding));
    },

    readActor: (actorId) => {
      const actor = store.actors.get(actorId);
      return Promise.resolve(actor ? structuredClone(actor) : undefined);
    },

    createActor: (input) => {
      const existing = store.actors.get(input.actorId);
      if (existing) {
        return Promise.resolve(structuredClone(existing));
      }
      const actor: ActorRecord = {
        actorId: input.actorId,
        displayName: input.displayName,
        isActive: input.isActive ?? true,
        authorizationRevision: 1,
      };
      store.actors.set(input.actorId, actor);
      return Promise.resolve(structuredClone(actor));
    },

    listMemberships: (actorId) => {
      const memberships = store.memberships
        .values()
        .filter((membership) => membership.actorId === actorId)
        .map((membership) => structuredClone(membership))
        .toArray();
      return Promise.resolve(memberships);
    },

    readMembership: (membershipId) => {
      const membership = store.memberships.get(membershipId);
      return Promise.resolve(
        membership ? structuredClone(membership) : undefined
      );
    },

    readTenantName: (tenantId) =>
      Promise.resolve(store.tenantNames.get(tenantId)),

    listRosterClassIds: (membershipId) => {
      const classIds = store.classAssignments.get(membershipId) ?? [];
      return Promise.resolve(structuredClone(classIds));
    },

    grantMembership: (input) => {
      const existing = store.memberships.values().find((membership) => {
        return (
          membership.actorId === input.actorId &&
          membership.tenantId === input.tenantId &&
          membership.role === input.role
        );
      });
      if (existing) {
        return Promise.resolve(structuredClone(existing));
      }
      const membership: MembershipRecord = {
        membershipId: input.membershipId,
        actorId: input.actorId,
        tenantId: input.tenantId,
        tenantName: input.tenantName,
        role: input.role,
        status: "active",
        revision: 1,
        ...(input.learnerId && { learnerId: input.learnerId }),
      };
      store.memberships.set(input.membershipId, membership);
      return Promise.resolve(structuredClone(membership));
    },

    assignClass: (input) => {
      const classIds = store.classAssignments.get(input.membershipId) ?? [];
      if (!classIds.includes(input.classId)) {
        store.classAssignments.set(input.membershipId, [
          ...classIds,
          input.classId,
        ]);
      }
      return Promise.resolve();
    },

    revokeMembership: (membershipId) => {
      const membership = store.memberships.get(membershipId);
      if (!membership || membership.status === "revoked") {
        return Promise.resolve(false);
      }
      store.memberships.set(membershipId, {
        ...membership,
        status: "revoked",
        revision: membership.revision + 1,
      });
      return Promise.resolve(true);
    },

    disableActor: (actorId) => {
      const actor = store.actors.get(actorId);
      if (!actor) {
        return Promise.resolve(false);
      }
      store.actors.set(actorId, {
        ...actor,
        isActive: false,
        authorizationRevision: actor.authorizationRevision + 1,
      });
      const now = new Date();
      const revokedAt = now.toISOString();
      for (const [sessionId, session] of store.sessions) {
        if (session.actorId === actorId && !session.revokedAt) {
          store.sessions.set(sessionId, {
            ...session,
            revokedAt,
            revision: session.revision + 1,
          });
        }
      }
      return Promise.resolve(true);
    },

    createSession: (input) => {
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
        ...(input.providerCredentialsCiphertext && {
          providerCredentialsCiphertext: input.providerCredentialsCiphertext,
        }),
      };
      store.sessions.set(session.sessionId, session);
      store.sessionVerifiers.set(session.verifierHash, session.sessionId);
      return Promise.resolve();
    },

    readSessionByVerifier: (verifierHash) =>
      Promise.resolve(readSessionByVerifier(verifierHash)),

    readSession: (sessionId) => Promise.resolve(readSession(sessionId)),

    touchSession: (update) => {
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
      return Promise.resolve(updated !== undefined);
    },

    rotateSessionCredentials: (replacement) => {
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
      return Promise.resolve(updated !== undefined);
    },

    revokeSession: (sessionId, revokedAt) => {
      const session = store.sessions.get(sessionId);
      if (!session || session.revokedAt) {
        return Promise.resolve(undefined);
      }
      const revoked: IdentitySessionRecord = {
        ...session,
        revokedAt,
        revision: session.revision + 1,
      };
      store.sessions.set(sessionId, revoked);
      return Promise.resolve(structuredClone(revoked));
    },

    createPendingAuthentication: (record) => {
      store.pendingAuthentications.set(
        record.pendingId,
        structuredClone(record)
      );
      store.pendingVerifiers.set(record.verifierHash, record.pendingId);
      return Promise.resolve();
    },

    readPendingAuthentication: (verifierHash) => {
      const pendingId = store.pendingVerifiers.get(verifierHash);
      if (!pendingId) {
        return Promise.resolve(undefined);
      }
      const pending = store.pendingAuthentications.get(pendingId);
      return Promise.resolve(pending ? structuredClone(pending) : undefined);
    },

    consumePendingAuthentication: (pendingId, consumedAt) => {
      const pending = store.pendingAuthentications.get(pendingId);
      if (!pending || pending.consumedAt) {
        return Promise.resolve(false);
      }
      store.pendingAuthentications.set(pendingId, { ...pending, consumedAt });
      return Promise.resolve(true);
    },

    appendProvisioningAudit: (entry) => {
      store.provisioningAudit.push(structuredClone(entry));
      return Promise.resolve();
    },
  };
};
