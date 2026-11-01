import {
  publicationApproveInputSchema,
  publicationPublishInputSchema,
  publicationReviseInputSchema,
  publicationTargetKey,
  reversePathTargetId,
  reviewPackSchema,
  warningsForTarget,
} from "@/shared/publication-contract";
import { compileLessonPreview } from "@/server/a2ui/compiler";
import { createId } from "@/server/ids";
import { PackUniqueViolationError } from "@/server/persistence/pack-port";
import {
  buildEditedVersion,
  buildInitialVersion,
  decodePackVersion,
  deriveVersionArtifact,
  initialRevision,
  publicContentSchema,
} from "./contracts";
import { publicationError } from "./errors";
import { createCanonicalHash } from "./hashes";
import { bridgePublishedPack } from "./record-bridge";
import type { DecodedPackVersion } from "./contracts";
import type {
  PackApprovalRecord,
  PackPersistence,
  PackReceiptRecord,
  PackVersionRecord,
} from "@/server/persistence/pack-port";

import type { CompiledLessonPreview } from "@/server/a2ui/compiler";
import type { RecordPersistence } from "@/server/persistence/records-commands";
import type {
  GenerationPersistence,
  LessonGenerationRecord,
} from "@/server/generation/types";
import type { TeacherActor } from "@/server/identity/types";
import type {
  PublicationAction,
  ReviewPack,
  ReviewVersion,
} from "@/shared/publication-contract";

export interface PublicationServiceOptions {
  generation: GenerationPersistence;
  packs: PackPersistence;
  records?: RecordPersistence;
  now?: () => string;
}

export interface PublishOutcome {
  review: ReviewPack;
  publicationId: string;
  assignmentId: string;
}

export interface PublicationService {
  openReview: (actor: TeacherActor, requestId: string) => Promise<ReviewPack>;
  readReview: (actor: TeacherActor, requestId: string) => Promise<ReviewPack>;
  approve: (actor: TeacherActor, input: unknown) => Promise<ReviewPack>;
  revise: (actor: TeacherActor, input: unknown) => Promise<ReviewPack>;
  publish: (actor: TeacherActor, input: unknown) => Promise<PublishOutcome>;
  compileVersionPreview: (
    actor: TeacherActor,
    versionId: string
  ) => Promise<CompiledLessonPreview>;
}

const approvalSchemaVersion = "pack-approval-v1";
const publicationSchemaVersion = "pack-publication-v1";
const assignmentSchemaVersion = "pack-assignment-v1";
const receiptSchemaVersion = "pack-receipt-v1";
const readyForReviewState = "ready-for-review";
const blockedByValidationState = "blocked-by-validation";
const forbiddenMessage = "You do not have access to this resource.";
const staleMessage =
  "This revision changed since you loaded it. Reload the review.";
const approveTargetAction = "approve-target";
const reviseVersionAction = "revise-version";
const publishAction = "publish";

const nowIso = (): string => {
  const now = new Date();
  return now.toISOString();
};

const withoutOperationKey = (input: Record<string, unknown>) => {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== "operationKey")
  );
};

const inputHashOf = (input: Record<string, unknown>): string =>
  createCanonicalHash(withoutOperationKey(input));

const allWarningCodes = (decoded: DecodedPackVersion): string[] => {
  const codes = decoded.validationResult.findings
    .filter((finding) => finding.verdict === "warning")
    .map((finding) => finding.code);
  return [...new Set(codes)];
};

const projectVersion = (
  version: PackVersionRecord,
  approvals: readonly PackApprovalRecord[]
): ReviewVersion => {
  const decoded = decodePackVersion(version);
  return {
    id: version.id,
    revision: version.revision,
    state:
      version.state === readyForReviewState
        ? readyForReviewState
        : blockedByValidationState,
    artifactHash: version.artifactHash,
    gateVerdict:
      version.gateVerdict === "pass" || version.gateVerdict === "warning"
        ? version.gateVerdict
        : "hard_block",
    createdAt: version.createdAt,
    findings: [...decoded.validationResult.findings],
    approvals: approvals.map((approval) => {
      return {
        targetKind:
          approval.targetKind === "variant" ? "variant" : "reverse-path",
        targetId: approval.targetId,
        approvingActorId: approval.approvingActorId,
        approvedAt: approval.createdAt,
      };
    }),
  };
};

const publishBlockersFor = (
  version: PackVersionRecord,
  decoded: DecodedPackVersion,
  approvals: readonly PackApprovalRecord[]
): string[] => {
  const blockers: string[] = [];
  if (
    version.state !== readyForReviewState ||
    version.gateVerdict === "hard_block"
  ) {
    blockers.push("GATE_NOT_READY");
  }

  const approved = new Set(
    approvals.map((approval) =>
      publicationTargetKey(approval.targetKind, approval.targetId)
    )
  );
  for (const variant of decoded.publicContent.variants) {
    if (!approved.has(`variant:${variant.id}`)) {
      blockers.push(`MISSING_VARIANT_APPROVAL:${variant.id}`);
    }
  }
  if (!approved.has(`reverse-path:${reversePathTargetId}`)) {
    blockers.push("MISSING_REVERSE_PATH_APPROVAL");
  }

  const acknowledged = new Set(
    approvals.flatMap((approval) => approval.acknowledgedFindingCodes)
  );
  for (const code of allWarningCodes(decoded)) {
    if (!acknowledged.has(code)) {
      blockers.push(`WARNING_UNACKNOWLEDGED:${code}`);
    }
  }

  return blockers;
};

export const createPublicationService = (
  options: PublicationServiceOptions
): PublicationService => {
  const { generation, packs, records } = options;
  const clock = options.now ?? nowIso;

  const loadGeneration = async (
    actor: TeacherActor,
    requestId: string
  ): Promise<LessonGenerationRecord> => {
    const record = await generation.readGeneration(actor.tenantId, requestId);
    if (!record || record.teacherId !== actor.actorId) {
      // A private mutation never reveals whether another teacher's or
      // tenant's draft exists (PT-20, PT-28).
      throw publicationError("PUBLICATION_FORBIDDEN", forbiddenMessage);
    }
    return record;
  };

  const loadVersion = async (
    actor: TeacherActor,
    requestId: string,
    versionId: string
  ): Promise<PackVersionRecord> => {
    const version = await packs.readVersion(actor.tenantId, versionId);
    if (
      !version ||
      version.requestId !== requestId ||
      version.teacherActorId !== actor.actorId
    ) {
      throw publicationError("PUBLICATION_FORBIDDEN", forbiddenMessage);
    }
    return version;
  };

  const assertLatest = async (
    actor: TeacherActor,
    version: PackVersionRecord
  ): Promise<void> => {
    const latest = await packs.readLatestVersion(
      actor.tenantId,
      version.requestId
    );
    if (!latest || latest.id !== version.id) {
      throw publicationError(
        "REVIEW_STALE",
        "A newer revision exists. Reload the review before continuing."
      );
    }
  };

  const projectReview = async (
    actor: TeacherActor,
    version: PackVersionRecord
  ): Promise<ReviewPack> => {
    const decoded = decodePackVersion(version);
    const approvals = await packs.listApprovals(actor.tenantId, version.id);
    const publication = await packs.readPublicationForVersion(
      actor.tenantId,
      version.id
    );
    const assignment = publication
      ? await packs.readAssignmentForPublication(actor.tenantId, publication.id)
      : undefined;
    const learners = await packs.listLearners(actor.tenantId);
    const blockers = publishBlockersFor(version, decoded, approvals);
    if (publication) {
      blockers.push("ALREADY_PUBLISHED");
    }
    const learnerName = assignment
      ? learners.find((learner) => learner.id === assignment.learnerId)
          ?.displayName
      : undefined;

    return reviewPackSchema.parse({
      requestId: version.requestId,
      recordState: "ready-for-review",
      version: projectVersion(version, approvals),
      draft: {
        ...decoded.publicContent.input,
        variants: decoded.publicContent.variants,
      },
      learningPath: {
        direction: decoded.publicContent.learningPath.direction,
        steps: decoded.publicContent.learningPath.steps,
        rationale: decoded.publicContent.learningPath.rationale,
        nextScreenRationale:
          decoded.publicContent.learningPath.nextScreenRationale,
      },
      provenance: {
        provider: decoded.provenance.provider,
        model: decoded.provenance.model,
        promptTemplateVersion: decoded.provenance.promptTemplateVersion,
        validatorVersion: decoded.provenance.validatorVersion,
        catalogVersion: decoded.provenance.catalogVersion,
        sourceSnapshotId: decoded.provenance.sourceSnapshotId,
        editedAt: decoded.provenance.editedAt,
      },
      canPublish: blockers.length === 0,
      publishBlockers: blockers,
      publication: publication
        ? {
            id: publication.id,
            approvedAt: publication.approvedAt,
            artifactHash: publication.artifactHash,
          }
        : null,
      assignment: assignment
        ? {
            id: assignment.id,
            learnerId: assignment.learnerId,
            learnerDisplayName: learnerName ?? assignment.learnerId,
          }
        : null,
      availableLearners: learners,
    });
  };

  const openReview = async (
    actor: TeacherActor,
    requestId: string
  ): Promise<ReviewPack> => {
    const record = await loadGeneration(actor, requestId);
    if (record.state !== readyForReviewState || !record.gate) {
      throw publicationError(
        "REVIEW_NOT_READY",
        "Only a ready-for-review draft can enter the review gallery."
      );
    }

    const latest = await packs.readLatestVersion(actor.tenantId, requestId);
    if (latest && latest.sourceArtifactHash === record.gate.artifactHash) {
      return projectReview(actor, latest);
    }

    const revision = latest
      ? latest.revision + initialRevision
      : initialRevision;
    const write = buildInitialVersion(record, {
      revision,
      parentVersionId: latest?.id ?? null,
      now: clock(),
    });

    try {
      await packs.insertVersion(write);
    } catch (error) {
      const reopened = await packs.readLatestVersion(actor.tenantId, requestId);
      if (
        !reopened ||
        !(error instanceof PackUniqueViolationError) ||
        reopened.sourceArtifactHash !== record.gate.artifactHash
      ) {
        throw error;
      }
      return projectReview(actor, reopened);
    }

    return projectReview(actor, write);
  };

  const readReview = async (
    actor: TeacherActor,
    requestId: string
  ): Promise<ReviewPack> => {
    const latest = await packs.readLatestVersion(actor.tenantId, requestId);
    if (!latest || latest.teacherActorId !== actor.actorId) {
      throw publicationError(
        "PUBLICATION_NOT_FOUND",
        "This review has not been opened yet."
      );
    }
    return projectReview(actor, latest);
  };

  const findReceipt = async (
    actor: TeacherActor,
    action: PublicationAction,
    operationKey: string,
    inputHash: string
  ): Promise<PackReceiptRecord | null> => {
    const receipt = await packs.readReceipt(
      actor.tenantId,
      actor.actorId,
      action,
      operationKey
    );
    if (!receipt) {
      return null;
    }
    if (receipt.inputHash !== inputHash) {
      throw publicationError(
        "IDEMPOTENCY_CONFLICT",
        "This operation key was already used for a different request."
      );
    }
    return receipt;
  };

  const writeReceipt = async (
    actor: TeacherActor,
    action: PublicationAction,
    operationKey: string,
    inputHash: string,
    resultKind: string,
    resultIds: readonly string[]
  ): Promise<void> => {
    try {
      await packs.insertReceipt({
        id: createId(),
        tenantId: actor.tenantId,
        schemaVersion: receiptSchemaVersion,
        actorId: actor.actorId,
        membershipId: actor.membershipId,
        authorizationRevision: actor.authorizationRevision,
        action,
        operationKey,
        inputHash,
        resultKind,
        resultIds: [...resultIds],
        createdAt: clock(),
      });
    } catch (error) {
      // A concurrent replay may have written the same receipt. The unique
      // record it points at is the real idempotency guard; anything else is a
      // real persistence failure and must surface.
      if (!(error instanceof PackUniqueViolationError)) {
        throw error;
      }
    }
  };

  const approve = async (
    actor: TeacherActor,
    raw: unknown
  ): Promise<ReviewPack> => {
    const parsed = publicationApproveInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw publicationError(
        "PUBLICATION_INPUT_INVALID",
        "The approval request is not valid."
      );
    }
    const input = parsed.data;
    const version = await loadVersion(actor, input.requestId, input.versionId);
    await assertLatest(actor, version);

    const decoded = decodePackVersion(version);
    if (
      version.state !== readyForReviewState ||
      version.gateVerdict === "hard_block"
    ) {
      throw publicationError(
        "GATE_BLOCKED",
        "This revision is blocked by validation and cannot be approved."
      );
    }

    const variantIds = new Set(
      decoded.publicContent.variants.map((variant) => variant.id)
    );
    if (input.targetKind === "variant") {
      if (!variantIds.has(input.targetId)) {
        throw publicationError(
          "PUBLICATION_INPUT_INVALID",
          "The approved variant is not part of this revision."
        );
      }
    } else if (input.targetId !== reversePathTargetId) {
      throw publicationError(
        "PUBLICATION_INPUT_INVALID",
        "The reverse-path approval target is not valid."
      );
    }

    const requiredWarnings = warningsForTarget(
      decoded.validationResult.findings,
      input.targetKind,
      input.targetId
    ).map((finding) => finding.code);
    const acknowledged = new Set(input.acknowledgedFindingCodes);
    const missingWarnings = requiredWarnings.filter(
      (code) => !acknowledged.has(code)
    );
    if (missingWarnings.length > 0) {
      throw publicationError(
        "WARNINGS_UNACKNOWLEDGED",
        "Acknowledge every warning for this screen before approving it.",
        { detail: missingWarnings.join(",") }
      );
    }

    const inputHash = inputHashOf(input);
    const replay = await findReceipt(
      actor,
      approveTargetAction,
      input.operationKey,
      inputHash
    );
    if (replay) {
      return projectReview(actor, version);
    }

    const existing = await packs.readApproval(
      actor.tenantId,
      version.id,
      input.targetKind,
      input.targetId
    );
    if (existing) {
      if (existing.artifactHash !== version.artifactHash) {
        throw publicationError(
          "REVIEW_STALE",
          "The approval belongs to a different revision. Reload the review."
        );
      }
      await writeReceipt(
        actor,
        approveTargetAction,
        input.operationKey,
        inputHash,
        "pack-approval",
        [existing.id]
      );
      return projectReview(actor, version);
    }

    const approvalId = createId();
    try {
      await packs.insertApproval({
        id: approvalId,
        tenantId: actor.tenantId,
        schemaVersion: approvalSchemaVersion,
        versionId: version.id,
        targetKind: input.targetKind,
        targetId: input.targetId,
        approvingActorId: actor.actorId,
        artifactHash: version.artifactHash,
        validationResultHash: version.validationResultHash,
        acknowledgedFindingCodes: input.acknowledgedFindingCodes,
        createdAt: clock(),
      });
    } catch (error) {
      const concurrent = await packs.readApproval(
        actor.tenantId,
        version.id,
        input.targetKind,
        input.targetId
      );
      if (!concurrent || concurrent.artifactHash !== version.artifactHash) {
        throw error;
      }
    }

    await writeReceipt(
      actor,
      approveTargetAction,
      input.operationKey,
      inputHash,
      "pack-approval",
      [approvalId]
    );
    return projectReview(actor, version);
  };

  const revise = async (
    actor: TeacherActor,
    raw: unknown
  ): Promise<ReviewPack> => {
    const parsed = publicationReviseInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw publicationError(
        "PUBLICATION_INPUT_INVALID",
        "The revision request is not valid."
      );
    }
    const input = parsed.data;
    const current = await loadVersion(actor, input.requestId, input.versionId);
    await assertLatest(actor, current);
    if (current.artifactHash !== input.expectedArtifactHash) {
      throw publicationError("REVIEW_STALE", staleMessage);
    }

    const inputHash = inputHashOf(input);
    const replay = await findReceipt(
      actor,
      reviseVersionAction,
      input.operationKey,
      inputHash
    );
    if (replay) {
      return projectReview(actor, current);
    }

    const decoded = decodePackVersion(current);
    const write = buildEditedVersion(
      current,
      decoded,
      input.edits,
      actor.actorId,
      clock()
    );

    try {
      await packs.insertVersion(write);
    } catch (error) {
      const versions = await packs.listVersions(
        actor.tenantId,
        input.requestId
      );
      const concurrent = versions.find(
        (version) => version.revision === write.revision
      );
      if (!concurrent || concurrent.artifactHash !== write.artifactHash) {
        throw error;
      }
      return projectReview(actor, concurrent);
    }

    await writeReceipt(
      actor,
      reviseVersionAction,
      input.operationKey,
      inputHash,
      "pack-version",
      [write.id]
    );
    return projectReview(actor, write);
  };

  const publish = async (
    actor: TeacherActor,
    raw: unknown
  ): Promise<PublishOutcome> => {
    const parsed = publicationPublishInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw publicationError(
        "PUBLICATION_INPUT_INVALID",
        "The publish request is not valid."
      );
    }
    const input = parsed.data;
    const version = await loadVersion(actor, input.requestId, input.versionId);
    await assertLatest(actor, version);
    if (version.artifactHash !== input.expectedArtifactHash) {
      throw publicationError("REVIEW_STALE", staleMessage);
    }

    const inputHash = inputHashOf(input);
    const replay = await findReceipt(
      actor,
      publishAction,
      input.operationKey,
      inputHash
    );
    if (replay) {
      const [publicationId, assignmentId] = replay.resultIds;
      if (!publicationId || !assignmentId) {
        throw publicationError(
          "PUBLICATION_UNAVAILABLE",
          "The publish receipt is incomplete."
        );
      }
      return {
        review: await projectReview(actor, version),
        publicationId,
        assignmentId,
      };
    }

    const decoded = decodePackVersion(version);
    const artifact = deriveVersionArtifact(version, decoded);
    const approvals = await packs.listApprovals(actor.tenantId, version.id);
    const blockers = publishBlockersFor(version, decoded, approvals);
    if (blockers.length > 0) {
      const missingApproval = blockers.some((blocker) =>
        blocker.startsWith("MISSING_")
      );
      throw publicationError(
        missingApproval ? "MISSING_APPROVAL" : "GATE_STALE",
        "Every screen and the reverse path must be approved on this revision before publishing.",
        { detail: blockers.join(",") }
      );
    }

    const learner = await packs.readLearner(actor.tenantId, input.learnerId);
    if (!learner) {
      // A foreign roster is a referent deny, not an existence oracle (PT-29).
      throw publicationError(
        "PUBLICATION_FORBIDDEN",
        "That learner is not an active student in this tenant."
      );
    }

    const approvedAt = clock();
    let publicationId = createId();
    try {
      await packs.insertPublication({
        id: publicationId,
        tenantId: actor.tenantId,
        schemaVersion: publicationSchemaVersion,
        versionId: version.id,
        approvingActorId: actor.actorId,
        artifactHash: artifact.gate.artifactHash,
        validationResultHash: version.validationResultHash,
        contentHash: version.contentHash,
        privateAnswerDigest: version.privateAnswerDigest,
        ruleVersions: decoded.ruleVersions,
        approvedAt,
        createdAt: approvedAt,
      });
    } catch (error) {
      const concurrent = await packs.readPublicationForVersion(
        actor.tenantId,
        version.id
      );
      if (!concurrent || concurrent.artifactHash !== version.artifactHash) {
        throw error;
      }
      publicationId = concurrent.id;
    }

    let assignmentId = createId();
    try {
      await packs.insertAssignment({
        id: assignmentId,
        tenantId: actor.tenantId,
        schemaVersion: assignmentSchemaVersion,
        publicationId,
        learnerId: learner.id,
        assigningActorId: actor.actorId,
        createdAt: approvedAt,
      });
    } catch (error) {
      const concurrent = await packs.readAssignmentForPublication(
        actor.tenantId,
        publicationId
      );
      if (!concurrent) {
        throw error;
      }
      if (concurrent.learnerId !== learner.id) {
        throw publicationError(
          "IDEMPOTENCY_CONFLICT",
          "This publication is already assigned to another learner."
        );
      }
      assignmentId = concurrent.id;
    }

    await writeReceipt(
      actor,
      publishAction,
      input.operationKey,
      inputHash,
      "pack-publication",
      [publicationId, assignmentId]
    );

    // #6: the learner runtime reads the canonical model, so the publish also
    // writes that chain. Without a reviewed source there is nothing to cite,
    // and the pack stays publish-only.
    if (records && decoded.provenance.sourceSnapshotId) {
      await bridgePublishedPack(records, actor, {
        packVersionId: version.id,
        requestId: version.requestId,
        artifactHash: version.artifactHash,
        approvedAt,
        sourceSnapshotId: decoded.provenance.sourceSnapshotId,
        learnerId: learner.id,
        publicContent: decoded.publicContent,
        privateAnswers: decoded.privateAnswers,
        validationResult: decoded.validationResult,
        ruleVersions: decoded.ruleVersions,
        provenance: decoded.provenance,
      });
    }
    return {
      review: await projectReview(actor, version),
      publicationId,
      assignmentId,
    };
  };

  const compileVersionPreview = async (
    actor: TeacherActor,
    versionId: string
  ): Promise<CompiledLessonPreview> => {
    const version = await packs.readVersion(actor.tenantId, versionId);
    if (!version || version.teacherActorId !== actor.actorId) {
      throw publicationError(
        "PUBLICATION_NOT_FOUND",
        "This review revision was not found."
      );
    }
    const decoded = decodePackVersion(version);
    const artifact = deriveVersionArtifact(version, decoded);
    const content = publicContentSchema.parse(decoded.publicContent);
    return compileLessonPreview(artifact.gate.renderable, {
      requestId: version.id,
      grade: content.input.grade,
      standardId: content.input.standardId,
      language: content.input.language,
    });
  };

  return {
    openReview,
    readReview,
    approve,
    revise,
    publish,
    compileVersionPreview,
  };
};
