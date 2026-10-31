import type { PublicationAction } from "@/shared/publication-contract";

/**
The generated-pack persistence port (#5). It stores immutable review versions,
per-target approvals, the publication fact, the learner assignment, and
actor-scoped receipts. Every method is tenant-scoped; callers pass the tenant
resolved from the session, never a browser value.

JSONB payloads stay `unknown` at this boundary: the publication domain parses
them with its strict schemas before use.
*/

export interface PackVersionRecord {
  id: string;
  tenantId: string;
  schemaVersion: string;
  requestId: string;
  teacherActorId: string;
  revision: number;
  state: string;
  parentVersionId: string | null;
  sourceArtifactHash: string;
  artifactHash: string;
  gateVerdict: string;
  gateSnapshot: unknown;
  validationResult: unknown;
  validationResultHash: string;
  ruleVersions: unknown;
  provenance: unknown;
  publicContent: unknown;
  privateAnswers: unknown;
  contentHash: string;
  privateAnswerDigest: string;
  createdAt: string;
}

export interface PackApprovalRecord {
  id: string;
  tenantId: string;
  schemaVersion: string;
  versionId: string;
  targetKind: string;
  targetId: string;
  approvingActorId: string;
  artifactHash: string;
  validationResultHash: string;
  acknowledgedFindingCodes: readonly string[];
  createdAt: string;
}

export interface PackPublicationRecord {
  id: string;
  tenantId: string;
  schemaVersion: string;
  versionId: string;
  approvingActorId: string;
  artifactHash: string;
  validationResultHash: string;
  contentHash: string;
  privateAnswerDigest: string;
  ruleVersions: unknown;
  approvedAt: string;
  createdAt: string;
}

export interface PackAssignmentRecord {
  id: string;
  tenantId: string;
  schemaVersion: string;
  publicationId: string;
  learnerId: string;
  assigningActorId: string;
  createdAt: string;
}

export interface PackReceiptRecord {
  id: string;
  tenantId: string;
  schemaVersion: string;
  actorId: string;
  membershipId: string;
  authorizationRevision: number;
  action: string;
  operationKey: string;
  inputHash: string;
  resultKind: string;
  resultIds: readonly string[];
  createdAt: string;
}

export interface PackLearner {
  id: string;
  displayName: string;
}

export class PackUniqueViolationError extends Error {
  readonly constraint: string | undefined;

  constructor(constraint: string | undefined, options: ErrorOptions = {}) {
    super("A pack record already exists for this unique key.", options);
    this.name = "PackUniqueViolationError";
    this.constraint = constraint;
  }
}

export interface PackPersistence {
  readonly kind: "seeded-demo" | "postgres";
  check: () => Promise<boolean>;
  listVersions: (
    tenantId: string,
    requestId: string
  ) => Promise<PackVersionRecord[]>;
  readLatestVersion: (
    tenantId: string,
    requestId: string
  ) => Promise<PackVersionRecord | undefined>;
  readVersion: (
    tenantId: string,
    versionId: string
  ) => Promise<PackVersionRecord | undefined>;
  insertVersion: (record: PackVersionRecord) => Promise<void>;
  listApprovals: (
    tenantId: string,
    versionId: string
  ) => Promise<PackApprovalRecord[]>;
  readApproval: (
    tenantId: string,
    versionId: string,
    targetKind: string,
    targetId: string
  ) => Promise<PackApprovalRecord | undefined>;
  insertApproval: (record: PackApprovalRecord) => Promise<void>;
  readPublicationForVersion: (
    tenantId: string,
    versionId: string
  ) => Promise<PackPublicationRecord | undefined>;
  insertPublication: (record: PackPublicationRecord) => Promise<void>;
  readAssignmentForPublication: (
    tenantId: string,
    publicationId: string
  ) => Promise<PackAssignmentRecord | undefined>;
  insertAssignment: (record: PackAssignmentRecord) => Promise<void>;
  readReceipt: (
    tenantId: string,
    actorId: string,
    action: PublicationAction,
    operationKey: string
  ) => Promise<PackReceiptRecord | undefined>;
  insertReceipt: (record: PackReceiptRecord) => Promise<void>;
  listLearners: (tenantId: string) => Promise<PackLearner[]>;
  readLearner: (
    tenantId: string,
    learnerId: string
  ) => Promise<PackLearner | undefined>;
}
