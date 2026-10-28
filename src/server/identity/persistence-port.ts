import type {
  ActorId,
  ClassId,
  LearnerId,
  MembershipId,
  TenantId,
} from "./identifiers";
import type {
  IdentityRole,
  IdentitySessionRecord,
  MembershipRecord,
  PendingAuthenticationRecord,
  ProviderBindingRecord,
} from "./types";

export interface ActorRecord {
  readonly actorId: ActorId;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly authorizationRevision: number;
}

export interface ProvisioningAuditEntry {
  readonly operation: string;
  readonly principal: string;
  readonly targetId: string;
  readonly result: string;
  readonly requestId: string;
  readonly at: string;
}

export interface NewSessionInput {
  readonly sessionId: string;
  readonly verifierHash: string;
  readonly actorId: ActorId;
  readonly membershipId: MembershipId;
  readonly tenantId: TenantId;
  readonly providerSessionId: string;
  readonly providerSubject: string;
  readonly sessionGeneration: string;
  readonly authorizationRevision: number;
  readonly createdAt: string;
  readonly lastActivityAt: string;
  readonly absoluteExpiresAt: string;
  readonly providerCredentialsCiphertext?: string;
}

export interface SessionActivityUpdate {
  readonly sessionId: string;
  readonly expectedRevision: number;
  readonly lastActivityAt: string;
}

export interface SessionCredentialReplacement {
  readonly sessionId: string;
  readonly expectedRevision: number;
  readonly providerCredentialsCiphertext: string;
}

/**
 * Identity persistence: bindings, membership, sessions, pending authentication, and trusted provisioning. Tenant-scoped reads and writes carry the authorization revision alongside the domain expectation so revocation committed first blocks a stale write.
 */
export interface IdentityPersistence {
  readonly kind: "seeded-demo" | "postgres";

  findProviderBinding: (
    issuer: string,
    subject: string
  ) => Promise<ProviderBindingRecord | undefined>;
  createProviderBinding: (
    binding: ProviderBindingRecord
  ) => Promise<ProviderBindingRecord>;

  readActor: (actorId: ActorId) => Promise<ActorRecord | undefined>;
  listMemberships: (actorId: ActorId) => Promise<readonly MembershipRecord[]>;
  readMembership: (
    membershipId: MembershipId
  ) => Promise<MembershipRecord | undefined>;
  readTenantName: (tenantId: TenantId) => Promise<string | undefined>;
  listRosterClassIds: (
    membershipId: MembershipId
  ) => Promise<readonly ClassId[]>;

  createSession: (input: NewSessionInput) => Promise<void>;
  readSessionByVerifier: (
    verifierHash: string
  ) => Promise<IdentitySessionRecord | undefined>;
  readSession: (
    sessionId: string
  ) => Promise<IdentitySessionRecord | undefined>;
  touchSession: (update: SessionActivityUpdate) => Promise<boolean>;
  rotateSessionCredentials: (
    replacement: SessionCredentialReplacement
  ) => Promise<boolean>;
  revokeSession: (
    sessionId: string,
    revokedAt: string
  ) => Promise<IdentitySessionRecord | undefined>;

  createPendingAuthentication: (
    record: PendingAuthenticationRecord
  ) => Promise<void>;
  readPendingAuthentication: (
    verifierHash: string
  ) => Promise<PendingAuthenticationRecord | undefined>;
  consumePendingAuthentication: (
    pendingId: string,
    consumedAt: string
  ) => Promise<boolean>;

  /**
   * Trusted provisioning writes. Invoked only by a deployment-managed provisioning principal or explicit test/local tooling; never a public web route. Conflicting rebinding and invalid cross-tenant references are rejected transactionally.
   */
  createActor: (input: NewActorInput) => Promise<ActorRecord>;
  grantMembership: (input: NewMembershipInput) => Promise<MembershipRecord>;
  assignClass: (input: NewClassAssignmentInput) => Promise<void>;
  revokeMembership: (membershipId: MembershipId) => Promise<boolean>;
  /**
  Increment the actor revision and revoke every local session it opened.
  */
  disableActor: (actorId: ActorId) => Promise<boolean>;

  appendProvisioningAudit: (entry: ProvisioningAuditEntry) => Promise<void>;
}

export interface NewActorInput {
  readonly actorId: ActorId;
  readonly displayName: string;
  readonly isActive?: boolean;
}

export interface NewMembershipInput {
  readonly membershipId: MembershipId;
  readonly actorId: ActorId;
  readonly tenantId: TenantId;
  readonly tenantName: string;
  readonly role: IdentityRole;
  readonly learnerId?: LearnerId;
}

export interface NewClassAssignmentInput {
  readonly membershipId: MembershipId;
  readonly classId: ClassId;
  readonly tenantId: TenantId;
}
