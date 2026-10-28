import { createId } from "../ids";

import {
  createOpaqueCredential,
  createSessionGeneration,
  hashCredential,
} from "./cookies";
import { IdentityError } from "./errors";
import {
  absoluteWindowMs,
  idleExpiryFrom,
  idleWindowMs,
  pendingWindowMs,
} from "./projection";
import {
  membershipAttemptLimit,
  membershipAttemptWindowMs,
  normalizedAccountDigest,
  signInAccountLimit,
  signInAccountWindowMs,
  signUpSourceLimit,
  signUpSourceWindowMs,
  sourceSignInLimit,
} from "./rate-limit";

import type { ActorId } from "./identifiers";
import type { RateLimiter } from "./rate-limit";
import type { CredentialCipher } from "./cipher";
import type { IdentityPersistence } from "./persistence-port";
import type { IdentityProvider } from "./provider/port";

import type {
  Actor,
  IdentitySessionRecord,
  LearnerActor,
  MembershipRecord,
  PendingAuthenticationRecord,
  PendingMembershipOption,
  SessionResolution,
  TeacherActor,
} from "./types";

export interface IdentityServiceOptions {
  readonly persistence: IdentityPersistence;
  readonly provider: IdentityProvider;
  readonly cipher: CredentialCipher;
  readonly rateLimiter: RateLimiter;
  readonly now?: () => number;
  readonly clock?: () => string;
  /**
  Salt for rate-limit bucket digests; raw addresses and emails are never stored.
  */
  readonly correlationSecret?: string;
  readonly signInAttemptLimit?: number;
  readonly sourceSignInLimit?: number;
  readonly signUpSourceLimit?: number;
  readonly membershipAttemptLimit?: number;
}

export interface SignInCommand {
  readonly email: string;
  readonly password: string;
  readonly sourceAddress: string;
}

export interface SignUpCommand {
  readonly email: string;
  readonly password: string;
  readonly sourceAddress: string;
}

export interface ActiveSessionOutcome {
  readonly status: "active";
  readonly actor: Actor;
  readonly session: IdentitySessionRecord;
  readonly credential: string;
}

export interface MembershipRequiredOutcome {
  readonly status: "membership-required";
  readonly memberships: readonly PendingMembershipOption[];
  readonly pendingCredential: string;
  readonly expiresAt: string;
}

export type SignInOutcome = ActiveSessionOutcome | MembershipRequiredOutcome;

export interface VerificationPendingOutcome {
  readonly status: "verification-pending";
  readonly email: string;
}

export interface MembershipSelectionCommand {
  readonly pendingCredential: string;
  readonly membershipId: string;
  readonly sourceAddress: string;
}

export interface ContinueOutcome {
  readonly idleExpiresAt: string;
  readonly absoluteExpiresAt: string;
}

export interface EndSessionOutcome {
  readonly status: "revoked" | "durable-failure";
}

export interface IdentityService {
  readonly signIn: (command: SignInCommand) => Promise<SignInOutcome>;
  readonly signUpTeacher: (
    command: SignUpCommand
  ) => Promise<VerificationPendingOutcome>;
  readonly selectMembership: (
    command: MembershipSelectionCommand
  ) => Promise<ActiveSessionOutcome>;
  readonly resolveSession: (
    credential: string | undefined
  ) => Promise<SessionResolution>;
  readonly continueSession: (
    credential: string | undefined
  ) => Promise<ContinueOutcome | null>;
  readonly endSession: (
    credential: string | undefined
  ) => Promise<EndSessionOutcome>;
}

interface EncryptedCredentials {
  readonly accessToken: string;
  readonly refreshToken: string;
}

const isEncryptedCredentials = (
  value: unknown
): value is EncryptedCredentials => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.accessToken === "string" &&
    typeof candidate.refreshToken === "string"
  );
};

const parseCredentials = (
  ciphertext: string
): EncryptedCredentials | undefined => {
  const parsed: unknown = JSON.parse(ciphertext);
  return isEncryptedCredentials(parsed) ? parsed : undefined;
};

export const createIdentityService = (
  options: IdentityServiceOptions
): IdentityService => {
  const now = options.now ?? (() => Date.now());
  const clock =
    options.clock ??
    (() => {
      const at = new Date();
      return at.toISOString();
    });
  const correlationSecret = options.correlationSecret ?? "edu-canvas";

  const readCredentials = (
    ciphertext: string | undefined
  ): EncryptedCredentials | undefined => {
    if (!ciphertext) {
      return undefined;
    }
    try {
      return parseCredentials(options.cipher.decrypt(ciphertext));
    } catch {
      // A missing rotation key invalidates the session rather than falling back.
      return undefined;
    }
  };

  const buildActor = async (
    session: IdentitySessionRecord
  ): Promise<Actor | undefined> => {
    // Independent reads share one round trip. Every verified request takes this
    // path, so a serialized chain would add the full read latency each time.
    const [actorRecord, membership, tenantNameRecord] = await Promise.all([
      options.persistence.readActor(session.actorId),
      options.persistence.readMembership(session.membershipId),
      options.persistence.readTenantName(session.tenantId),
    ]);

    if (
      !actorRecord ||
      !actorRecord.isActive ||
      actorRecord.authorizationRevision !== session.authorizationRevision
    ) {
      return undefined;
    }

    if (
      !membership ||
      membership.status !== "active" ||
      membership.actorId !== session.actorId ||
      membership.tenantId !== session.tenantId
    ) {
      return undefined;
    }

    const base = {
      actorId: session.actorId,
      displayName: actorRecord.displayName,
      tenantId: session.tenantId,
      tenantName: tenantNameRecord ?? membership.tenantName,
      membershipId: session.membershipId,
      sessionId: session.sessionId,
      sessionGeneration: session.sessionGeneration,
      authorizationRevision: session.authorizationRevision,
    };

    if (membership.role === "teacher") {
      const rosterClassIds = await options.persistence.listRosterClassIds(
        membership.membershipId
      );
      const teacher: TeacherActor = {
        ...base,
        role: "teacher",
        rosterClassIds,
      };
      return teacher;
    }

    if (!membership.learnerId) {
      return undefined;
    }
    const learner: LearnerActor = {
      ...base,
      role: "student",
      learnerId: membership.learnerId,
    };
    return learner;
  };

  const establishSession = async (input: {
    readonly actorId: ActorId;
    readonly membership: MembershipRecord;
    readonly authorizationRevision: number;
    readonly providerSessionId: string;
    readonly providerSubject: string;
    readonly providerCredentialsCiphertext?: string;
  }): Promise<ActiveSessionOutcome> => {
    const credential = createOpaqueCredential();
    const createdAt = clock();
    const absoluteExpiry = new Date(now() + absoluteWindowMs);
    const sessionRecord: IdentitySessionRecord = {
      sessionId: createId(),
      verifierHash: hashCredential(credential),
      actorId: input.actorId,
      membershipId: input.membership.membershipId,
      tenantId: input.membership.tenantId,
      providerSessionId: input.providerSessionId,
      providerSubject: input.providerSubject,
      sessionGeneration: createSessionGeneration(),
      authorizationRevision: input.authorizationRevision,
      revision: 1,
      createdAt,
      lastActivityAt: createdAt,
      absoluteExpiresAt: absoluteExpiry.toISOString(),
      ...(input.providerCredentialsCiphertext && {
        providerCredentialsCiphertext: input.providerCredentialsCiphertext,
      }),
    };

    await options.persistence.createSession({ ...sessionRecord });

    const actor = await buildActor(sessionRecord);
    if (!actor) {
      throw new IdentityError("FORBIDDEN");
    }
    return { status: "active", actor, session: sessionRecord, credential };
  };

  const encryptCredentials = (credentials: EncryptedCredentials): string =>
    options.cipher.encrypt(JSON.stringify(credentials));

  /**
   * Refresh is internal to the adapter, never a browser endpoint. Only the worker that wins the revision check replaces encrypted credentials; a waiter re-reads the result, and an ambiguous failure ends the local session rather than reusing a credential of unknown state.
   */
  const rotateCredentials = async (
    session: IdentitySessionRecord
  ): Promise<
    | {
        readonly status: "refreshed";
        readonly session: IdentitySessionRecord;
        readonly credentials: EncryptedCredentials;
      }
    | { readonly status: "unavailable" }
    | { readonly status: "ended" }
  > => {
    const current =
      (await options.persistence.readSession(session.sessionId)) ?? session;

    if (
      current.providerCredentialsCiphertext &&
      current.providerCredentialsCiphertext !==
        session.providerCredentialsCiphertext
    ) {
      // Another worker already replaced the credentials. Use its result instead
      // of starting a second refresh.
      const replacement = readCredentials(
        current.providerCredentialsCiphertext
      );
      return replacement
        ? { status: "refreshed", session: current, credentials: replacement }
        : { status: "ended" };
    }

    const existing = readCredentials(current.providerCredentialsCiphertext);
    if (!existing) {
      return { status: "ended" };
    }

    const outcome = await options.provider.refresh(existing.refreshToken);
    if (outcome.status === "unavailable") {
      return { status: "unavailable" };
    }
    if (outcome.status === "invalid") {
      await options.persistence.revokeSession(current.sessionId, clock());
      return { status: "ended" };
    }

    const nextCredentials: EncryptedCredentials = {
      accessToken: outcome.auth.accessToken,
      refreshToken: outcome.auth.refreshToken,
    };
    const rotated = await options.persistence.rotateSessionCredentials({
      sessionId: current.sessionId,
      expectedRevision: current.revision,
      providerCredentialsCiphertext: options.cipher.encrypt(
        JSON.stringify(nextCredentials)
      ),
    });

    const latest = await options.persistence.readSession(current.sessionId);
    // A logout that wins the revision check leaves the session revoked, and its
    // late credentials are discarded rather than written back.
    if (!latest || latest.revokedAt) {
      return { status: "ended" };
    }
    if (!rotated) {
      const replacement = readCredentials(latest.providerCredentialsCiphertext);
      return replacement
        ? { status: "refreshed", session: latest, credentials: replacement }
        : { status: "ended" };
    }
    return {
      status: "refreshed",
      session: latest,
      credentials: nextCredentials,
    };
  };

  const validate = async (
    credential: string | undefined
  ): Promise<SessionResolution> => {
    if (!credential) {
      return { status: "unauthenticated" };
    }

    const session = await options.persistence.readSessionByVerifier(
      hashCredential(credential)
    );
    if (!session || session.revokedAt) {
      return { status: "unauthenticated" };
    }

    const current = now();
    if (
      current >= Date.parse(session.absoluteExpiresAt) ||
      current >= idleExpiryFrom(session.lastActivityAt)
    ) {
      return { status: "unauthenticated" };
    }

    const actor = await buildActor(session);
    if (!actor) {
      return { status: "unauthenticated" };
    }

    const credentials = readCredentials(session.providerCredentialsCiphertext);
    if (!credentials) {
      return { status: "unauthenticated" };
    }

    const providerStatus = await options.provider.verifySession(
      credentials.accessToken
    );
    if (providerStatus.status === "unavailable") {
      return { status: "unavailable" };
    }
    if (
      providerStatus.status === "active" &&
      providerStatus.subject === session.providerSubject
    ) {
      return { status: "active", actor, session };
    }

    // The provider no longer honours the access token. Try exactly one bounded
    // refresh before ending the session.
    const refreshed = await rotateCredentials(session);
    if (refreshed.status === "unavailable") {
      return { status: "unavailable" };
    }
    if (refreshed.status === "ended") {
      return { status: "unauthenticated" };
    }

    const reverified = await options.provider.verifySession(
      refreshed.credentials.accessToken
    );
    if (reverified.status === "unavailable") {
      return { status: "unavailable" };
    }
    return reverified.status === "active" &&
      reverified.subject === session.providerSubject
      ? { status: "active", actor, session: refreshed.session }
      : { status: "unauthenticated" };
  };

  return {
    signIn: async (command) => {
      const account = options.rateLimiter.consume(
        `signin:account:${normalizedAccountDigest(correlationSecret, command.email)}`,
        options.signInAttemptLimit ?? signInAccountLimit,
        signInAccountWindowMs
      );
      const source = options.rateLimiter.consume(
        `signin:source:${command.sourceAddress}`,
        options.sourceSignInLimit ?? sourceSignInLimit,
        signInAccountWindowMs
      );
      if (!account.allowed || !source.allowed) {
        throw new IdentityError("RATE_LIMITED");
      }

      const outcome = await options.provider.signInWithPassword(
        command.email,
        command.password
      );
      if (outcome.status === "unavailable") {
        throw new IdentityError("AUTH_UNAVAILABLE");
      }
      if (
        outcome.status === "rejected" ||
        outcome.status === "email-unverified"
      ) {
        throw new IdentityError("UNAUTHENTICATED");
      }

      const { auth } = outcome;
      const binding = await options.persistence.findProviderBinding(
        options.provider.issuer,
        auth.subject
      );
      if (!binding) {
        throw new IdentityError("ACCESS_NOT_PROVISIONED");
      }

      const actorRecord = await options.persistence.readActor(binding.actorId);
      if (!actorRecord) {
        throw new IdentityError("ACCESS_NOT_PROVISIONED");
      }
      if (!actorRecord.isActive) {
        throw new IdentityError("FORBIDDEN");
      }

      const actorMemberships = await options.persistence.listMemberships(
        binding.actorId
      );
      const activeMemberships = actorMemberships.filter(
        (membership) => membership.status === "active"
      );

      const [onlyMembership] = activeMemberships;
      if (!onlyMembership) {
        throw new IdentityError("ACCESS_NOT_PROVISIONED");
      }

      const providerCredentialsCiphertext = encryptCredentials({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
      });

      if (activeMemberships.length === 1) {
        return establishSession({
          actorId: binding.actorId,
          membership: onlyMembership,
          authorizationRevision: actorRecord.authorizationRevision,
          providerSessionId: auth.providerSessionId,
          providerSubject: auth.subject,
          providerCredentialsCiphertext,
        });
      }

      const pendingCredential = createOpaqueCredential();
      const pendingExpiry = new Date(now() + pendingWindowMs);
      const expiresAt = pendingExpiry.toISOString();
      const memberships: readonly PendingMembershipOption[] =
        activeMemberships.map((membership) => {
          return {
            membershipId: membership.membershipId,
            tenantName: membership.tenantName,
            role: membership.role,
          };
        });
      const pending: PendingAuthenticationRecord = {
        pendingId: createId(),
        verifierHash: hashCredential(pendingCredential),
        actorId: binding.actorId,
        memberships,
        providerSessionId: auth.providerSessionId,
        providerSubject: auth.subject,
        providerCredentialsCiphertext,
        createdAt: clock(),
        expiresAt,
      };
      await options.persistence.createPendingAuthentication(pending);

      return {
        status: "membership-required",
        memberships,
        pendingCredential,
        expiresAt,
      };
    },

    signUpTeacher: async (command) => {
      const source = options.rateLimiter.consume(
        `signup:source:${command.sourceAddress}`,
        options.signUpSourceLimit ?? signUpSourceLimit,
        signUpSourceWindowMs
      );
      if (!source.allowed) {
        throw new IdentityError("RATE_LIMITED");
      }

      const outcome = await options.provider.signUpTeacher(
        command.email,
        command.password
      );
      if (outcome.status === "unavailable") {
        throw new IdentityError("AUTH_UNAVAILABLE");
      }
      // New and duplicate addresses receive the same state (no enumeration).
      return { status: "verification-pending", email: outcome.email };
    },

    selectMembership: async (command) => {
      const source = options.rateLimiter.consume(
        `membership:source:${command.sourceAddress}`,
        options.membershipAttemptLimit ?? membershipAttemptLimit,
        membershipAttemptWindowMs
      );
      if (!source.allowed) {
        throw new IdentityError("RATE_LIMITED");
      }

      const pending = await options.persistence.readPendingAuthentication(
        hashCredential(command.pendingCredential)
      );
      if (
        !pending ||
        pending.consumedAt ||
        Date.parse(pending.expiresAt) <= now()
      ) {
        throw new IdentityError("UNAUTHENTICATED");
      }

      const candidate = pending.memberships.find(
        (membership) => membership.membershipId === command.membershipId
      );
      if (!candidate) {
        throw new IdentityError("FORBIDDEN");
      }

      const membership = await options.persistence.readMembership(
        candidate.membershipId
      );
      if (
        !membership ||
        membership.actorId !== pending.actorId ||
        membership.status !== "active"
      ) {
        throw new IdentityError("FORBIDDEN");
      }

      const actorRecord = await options.persistence.readActor(pending.actorId);
      if (!actorRecord || !actorRecord.isActive) {
        throw new IdentityError("FORBIDDEN");
      }

      const consumed = await options.persistence.consumePendingAuthentication(
        pending.pendingId,
        clock()
      );
      if (!consumed) {
        throw new IdentityError("UNAUTHENTICATED");
      }

      return establishSession({
        actorId: pending.actorId,
        membership,
        authorizationRevision: actorRecord.authorizationRevision,
        providerSessionId: pending.providerSessionId,
        providerSubject: pending.providerSubject,
        ...(pending.providerCredentialsCiphertext && {
          providerCredentialsCiphertext: pending.providerCredentialsCiphertext,
        }),
      });
    },

    resolveSession: validate,

    continueSession: async (credential) => {
      const resolution = await validate(credential);
      if (resolution.status !== "active") {
        return null;
      }

      const { session } = resolution;
      const extension = Math.min(
        now() + idleWindowMs,
        Date.parse(session.absoluteExpiresAt)
      );
      const extensionDate = new Date(extension);
      const nextIdle = extensionDate.toISOString();
      const touched = await options.persistence.touchSession({
        sessionId: session.sessionId,
        expectedRevision: session.revision,
        lastActivityAt: nextIdle,
      });
      if (!touched) {
        return null;
      }
      return {
        idleExpiresAt: nextIdle,
        absoluteExpiresAt: session.absoluteExpiresAt,
      };
    },

    endSession: async (credential) => {
      if (!credential) {
        return { status: "revoked" };
      }
      const session = await options.persistence.readSessionByVerifier(
        hashCredential(credential)
      );
      if (!session || session.revokedAt) {
        return { status: "revoked" };
      }

      const revoked = await options.persistence.revokeSession(
        session.sessionId,
        clock()
      );
      if (!revoked) {
        return { status: "durable-failure" };
      }

      const credentials = readCredentials(
        session.providerCredentialsCiphertext
      );
      if (credentials) {
        // Best effort for this session only, never a global sign-out. A provider
        // outage must not turn a completed local logout into a failure.
        try {
          await options.provider.signOut(credentials.accessToken);
        } catch {
          // The local revocation above is already durable.
        }
      }

      return { status: "revoked" };
    },
  };
};
