import { sourceRequestErrorStatusByCode } from "@/shared/source-contract";
import type {
  SourceFailureReason,
  SourceFileFormat,
  SourceGap,
  SourceRequestErrorCode,
  SourceReviewInput,
  SourceSnapshotState,
  PublicSourceSnapshot,
  PublicSourceSnapshotSummary,
} from "@/shared/source-contract";

import type { ContentSafety } from "../moderation/content-safety";
import type { TeacherActor } from "../identity/types";

/**
Application-owned record for one bounded source (#114). Snapshots are
immutable: repair creates a new row linked through `replacesSnapshotId`.
*/
export interface SourceSnapshotRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly teacherId: string;
  readonly standardId: string;
  readonly mode: "upload";
  readonly fileName: string;
  readonly fileFormat: SourceFileFormat;
  readonly fileSizeBytes: number;
  readonly pageCount: number | null;
  readonly contentHash: string | null;
  readonly extractedText: string | null;
  readonly state: SourceSnapshotState;
  readonly gaps: readonly SourceGap[];
  readonly failureReason: SourceFailureReason | null;
  readonly unverifiedAlignment: boolean;
  readonly alignmentAcknowledgedAt: string | null;
  readonly syntheticMaterialConfirmed: boolean;
  readonly requiredSkillsConfirmedAt: string | null;
  readonly reviewedAt: string | null;
  readonly usedAt: string | null;
  readonly expiresAt: string;
  readonly replacesSnapshotId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type SourceRequestErrorCodeUnion = SourceRequestErrorCode;

/**
Every source request rejection carries a code from the shared seam contract
and the transport status that code maps to, the way `GenerationRequestError`
does for generation.
*/
export interface SourceRequestErrorOptions extends ErrorOptions {
  readonly code: SourceRequestErrorCode;
}

export class SourceRequestError extends Error {
  readonly code: SourceRequestErrorCode;
  readonly status: number;

  constructor(message: string, options: SourceRequestErrorOptions) {
    super(message, options);
    this.name = "SourceRequestError";
    this.code = options.code;
    this.status = sourceRequestErrorStatusByCode[options.code];
  }
}

export interface SourceUploadCommand {
  readonly actor: TeacherActor;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly syntheticMaterialConfirmed: boolean;
  readonly replacesSnapshotId?: string;
}

export interface CorrectedTextCommand {
  readonly actor: TeacherActor;
  readonly correctedText: string;
  readonly replacesSnapshotId?: string;
}

export interface SourceReviewCommand {
  readonly actor: TeacherActor;
  readonly snapshotId: string;
  readonly input: SourceReviewInput;
}

/**
Persistence port for source snapshots. Only `src/server/persistence` touches
PostgreSQL; the in-memory test double keeps tests
whole.
*/
export interface SourcePersistence {
  insertSnapshot: (record: SourceSnapshotRecord) => Promise<void>;
  updateSnapshot: (
    record: SourceSnapshotRecord,
    expectedUpdatedAt: string
  ) => Promise<boolean>;
  readSnapshot: (
    tenantId: string,
    teacherId: string,
    snapshotId: string
  ) => Promise<SourceSnapshotRecord | undefined>;
  listSnapshots: (
    tenantId: string,
    teacherId: string
  ) => Promise<readonly SourceSnapshotRecord[]>;
  deleteSnapshot: (
    tenantId: string,
    teacherId: string,
    snapshotId: string
  ) => Promise<boolean>;
  expireSnapshotsBefore: (nowIso: string) => Promise<number>;
  failStaleExtractingSnapshots: (
    staleBeforeIso: string,
    nowIso: string
  ) => Promise<number>;
  markSnapshotUsed: (
    tenantId: string,
    teacherId: string,
    snapshotId: string,
    usedAtIso: string,
    expiresAtIso: string
  ) => Promise<boolean>;
}

export type SourceGateResolution =
  | { readonly ok: true; readonly snapshotId: string }
  | { readonly ok: false; readonly message: string };

/**
Narrow port generation consumes so a partial or unreviewed source blocks generation without coupling the two domains. Delivery wires the persistence backed implementation.
*/
export interface SourceGate {
  resolveForGeneration: (
    actor: { readonly tenantId: string; readonly teacherId: string },
    sourceSnapshotId: string
  ) => Promise<SourceGateResolution>;
  markUsed: (
    tenantId: string,
    teacherId: string,
    sourceSnapshotId: string,
    usedAtIso: string
  ) => Promise<void>;
}

export interface SourceCleanupResult {
  readonly expired: number;
  readonly interrupted: number;
}

export interface SourceService {
  upload: (command: SourceUploadCommand) => Promise<PublicSourceSnapshot>;
  addCorrectedText: (
    command: CorrectedTextCommand
  ) => Promise<PublicSourceSnapshot>;
  list: (actor: TeacherActor) => Promise<PublicSourceSnapshotSummary[]>;
  read: (
    actor: TeacherActor,
    snapshotId: string
  ) => Promise<PublicSourceSnapshot>;
  cancel: (actor: TeacherActor, snapshotId: string) => Promise<void>;
  review: (command: SourceReviewCommand) => Promise<PublicSourceSnapshot>;
  runCleanup: (nowIso: string) => Promise<SourceCleanupResult>;
}

export interface SourceServiceOptions {
  persistence: SourcePersistence;
  safety: ContentSafety;
  /**
  Resolves whether the pinned standard's required-skill pack is available.
  When it is not, the snapshot carries the `missing-prerequisites` gap and
  blocks generation. Delivery wires the same curriculum resolver generation
  uses; defaults to available.
  */
  resolveStandardPack?: (standardId: string, tenantId: string) => boolean;
  now?: () => string;
  createSnapshotId?: () => string;
}
