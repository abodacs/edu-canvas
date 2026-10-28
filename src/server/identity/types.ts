import type {
  ActorId,
  ClassId,
  LearnerId,
  MembershipId,
  TenantId,
} from "./identifiers";

export const identityRoleValues = ["teacher", "student"] as const;
export type IdentityRole = (typeof identityRoleValues)[number];

/**
 * Capabilities are derived from the current membership and roster relationships on the server. A browser never supplies them.
 */
export const capabilityValues = [
  "read_environment",
  "generate",
  "preview_draft",
  "publish",
  "read_assignment",
  "submit_attempt",
  "teacher_decision",
  "cancel_generation",
  "logout",
] as const;
export type Capability = (typeof capabilityValues)[number];

const teacherCapabilities = [
  "read_environment",
  "generate",
  "preview_draft",
  "publish",
  "read_assignment",
  "teacher_decision",
  "cancel_generation",
  "logout",
] as const satisfies readonly Capability[];

const learnerCapabilities = [
  "read_environment",
  "read_assignment",
  "submit_attempt",
  "logout",
] as const satisfies readonly Capability[];

const capabilitiesByRole: Record<IdentityRole, readonly Capability[]> = {
  teacher: teacherCapabilities,
  student: learnerCapabilities,
};

export const capabilitiesForRole = (
  role: IdentityRole
): readonly Capability[] => capabilitiesByRole[role];

interface ActorBase {
  readonly actorId: ActorId;
  readonly displayName: string;
  readonly tenantId: TenantId;
  readonly tenantName: string;
  readonly membershipId: MembershipId;
  readonly sessionId: string;
  /**
  Non-secret session generation used to key client caches and drop stale results.
  */
  readonly sessionGeneration: string;
  readonly authorizationRevision: number;
}

export interface TeacherActor extends ActorBase {
  readonly role: "teacher";
  /**
  Classes this teacher is currently assigned to inside the active tenant.
  */
  readonly rosterClassIds: readonly ClassId[];
}

export interface LearnerActor extends ActorBase {
  readonly role: "student";
  readonly learnerId: LearnerId;
}

export type Actor = TeacherActor | LearnerActor;

export interface SessionTimes {
  readonly createdAt: string;
  readonly lastActivityAt: string;
  readonly absoluteExpiresAt: string;
}

export interface IdentitySessionRecord extends SessionTimes {
  readonly sessionId: string;
  readonly verifierHash: string;
  readonly actorId: ActorId;
  readonly membershipId: MembershipId;
  readonly tenantId: TenantId;
  /**
  The provider session this application session is bound to, for logout and status checks.
  */
  readonly providerSessionId: string;
  /**
  The verified provider subject, compared against the provider-status check.
  */
  readonly providerSubject: string;
  readonly sessionGeneration: string;
  readonly authorizationRevision: number;
  readonly revision: number;
  readonly revokedAt?: string;
  readonly providerCredentialsCiphertext?: string;
}

export interface MembershipRecord {
  readonly membershipId: MembershipId;
  readonly actorId: ActorId;
  readonly tenantId: TenantId;
  readonly tenantName: string;
  readonly role: IdentityRole;
  readonly status: "active" | "revoked";
  readonly learnerId?: LearnerId;
  readonly revision: number;
}

export interface ProviderBindingRecord {
  readonly providerIssuer: string;
  readonly providerSubject: string;
  readonly actorId: ActorId;
  readonly createdAt: string;
}

export interface PendingMembershipOption {
  readonly membershipId: MembershipId;
  readonly tenantName: string;
  readonly role: IdentityRole;
}

export interface PendingAuthenticationRecord {
  readonly pendingId: string;
  readonly verifierHash: string;
  readonly actorId: ActorId;
  readonly memberships: readonly PendingMembershipOption[];
  readonly providerSessionId: string;
  readonly providerSubject: string;
  readonly providerCredentialsCiphertext?: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly consumedAt?: string;
}

export interface TimedOutcome {
  readonly status: "active" | "unauthenticated" | "unavailable";
}

export interface ActiveResolution {
  readonly status: "active";
  readonly actor: Actor;
  readonly session: IdentitySessionRecord;
}

export interface UnauthenticatedResolution {
  readonly status: "unauthenticated";
}

export interface UnavailableResolution {
  readonly status: "unavailable";
}

/**
 * An exhaustive session resolution. Only the active variant carries an actor; an "authenticated" boolean with an optional actor would let a failed check read as a session.
 */
export type SessionResolution =
  ActiveResolution | UnauthenticatedResolution | UnavailableResolution;

export interface AuthenticatedSession {
  readonly actor: Actor;
  readonly session: IdentitySessionRecord;
  readonly credential: string;
}
