import {
  createContentHash,
  createPackageHash,
  createPrivateAnswerDigest,
  createValidationResultHash,
} from "@/server/records/hashes";
import { hashVersion, recordLimits } from "@/server/records/vocabulary";
import type { RecordPersistence } from "@/server/persistence/records-commands";
import type { Actor } from "@/server/identity/types";
import type {
  StoredPrivateAnswers,
  StoredProvenance,
  StoredPublicContent,
  StoredRuleVersions,
  StoredValidationResult,
} from "./contracts";

/**
 * #6: maps an approved pack onto the canonical record model and writes the chain the learner runtime reads. Every command is receipt-keyed, so a retried publish returns the same identifiers. The mapping is lossy by design: section bodies come from the approved instructions, and the objective hash pins the approved artifact.
 */
const sectionKinds = [
  "worked-example",
  "guided-practice",
  "independent-check",
  "follow-up",
] as const;

const projectionVersion = "lesson-package-public-v1";

export interface PackBridgeSource {
  readonly packVersionId: string;
  readonly requestId: string;
  readonly artifactHash: string;
  readonly approvedAt: string;
  readonly sourceSnapshotId: string;
  readonly learnerId: string;
  readonly publicContent: StoredPublicContent;
  readonly privateAnswers: StoredPrivateAnswers;
  readonly validationResult: StoredValidationResult;
  readonly ruleVersions: StoredRuleVersions;
  readonly provenance: StoredProvenance;
}

export interface PackBridgeResult {
  readonly versionId: string;
  readonly publicationId: string;
  readonly assignmentId: string;
}

const bounded = (value: string, max: number): string => {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
};

const buildSections = (content: StoredPublicContent) => {
  return content.variants.map((variant, index) => {
    const kind = sectionKinds[index];
    if (!kind) {
      throw new Error("The approved pack does not have four variants.");
    }
    return {
      id: `section-${variant.id}`,
      kind,
      title: bounded(variant.title, recordLimits.titleText),
      body: bounded(variant.instructions, recordLimits.bodyText),
      itemIds: variant.sourceItems.map((item) => item.id),
    };
  });
};

const buildRelationships = (answers: StoredPrivateAnswers) => {
  const targetsBySource = new Map<string, Set<string>>();
  for (const variant of answers.variants) {
    for (const relationship of variant.relationships) {
      const targets = targetsBySource.get(relationship.sourceId) ?? new Set();
      targets.add(relationship.targetId);
      targetsBySource.set(relationship.sourceId, targets);
    }
  }
  return [...targetsBySource].map(([itemId, targets]) => {
    return {
      itemId,
      correctTargetIds: [...targets],
    };
  });
};

const buildConceptIds = (content: StoredPublicContent): string[] => {
  const ids = content.learningPath.steps.map((step) => step.nodeId);
  return [...new Set(ids)].slice(0, recordLimits.listMax);
};

const buildValidationResult = (source: PackBridgeSource) => {
  return {
    ok: source.validationResult.findings.every(
      (finding) => finding.verdict !== "hard_block"
    ),
    validatorVersion: bounded(
      source.validationResult.validatorVersion,
      recordLimits.idLength
    ),
    checkedAt: source.approvedAt,
    findings: source.validationResult.findings.map((finding) => {
      return {
        code: bounded(finding.code, recordLimits.idLength),
        severity: finding.verdict === "hard_block" ? "error" : "warning",
        field: bounded(finding.field, recordLimits.idLength),
      };
    }),
  };
};

const buildRuleVersions = (source: PackBridgeSource) => {
  return {
    hashVersion,
    validatorVersion: bounded(
      source.ruleVersions.validatorVersion,
      recordLimits.idLength
    ),
    catalogVersion: bounded(
      source.ruleVersions.catalogVersion,
      recordLimits.idLength
    ),
    graphVersion: bounded(
      source.ruleVersions.graphVersion,
      recordLimits.idLength
    ),
    projectionVersion,
  };
};

export const bridgePublishedPack = async (
  records: RecordPersistence,
  actor: Actor,
  source: PackBridgeSource
): Promise<PackBridgeResult> => {
  const sections = buildSections(source.publicContent);
  const relationships = buildRelationships(source.privateAnswers);
  const variantReferences = source.publicContent.variants.map((variant) => {
    return {
      variantId: variant.id,
      kind: variant.kind,
    };
  });
  const conceptIds = buildConceptIds(source.publicContent);
  const validationResult = buildValidationResult(source);
  const ruleVersions = buildRuleVersions(source);
  const contentHash = createContentHash({
    conceptIds,
    sections,
    variantReferences,
  });
  const privateAnswerDigest = createPrivateAnswerDigest(relationships);
  const packageHash = createPackageHash({ contentHash, privateAnswerDigest });
  const validationResultHash = createValidationResultHash(validationResult);

  const version = await records.appendVersion(actor, {
    operationKey: `bridge-append-${source.packVersionId}`,
    package: {
      id: `pkg-${source.packVersionId}`,
      title: bounded(source.publicContent.input.prompt, recordLimits.titleText),
      standardId: source.publicContent.input.standardId,
    },
    expectedHeadRevision: 0,
    revisionKind: "initial",
    parentVersionId: null,
    predecessorVersionId: null,
    curatedReferenceId: null,
    sourceSnapshotId: source.sourceSnapshotId,
    generationRequestId: source.requestId,
    conceptIds,
    variantReferences,
    objectiveHash: source.artifactHash,
    sections,
    provenance: {
      provider: source.provenance.provider,
      modelVersion: source.provenance.model,
      promptVersion: source.provenance.promptTemplateVersion,
      authoredEdits: [],
    },
    changedSectionIds: sections.map((section) => section.id),
    ruleVersions,
    validationResult,
    privateAnswerRelationships: relationships,
  });

  const publication = await records.publish(actor, {
    operationKey: `bridge-publish-${source.packVersionId}`,
    versionId: version.id,
    contentHash,
    packageHash,
    privateAnswerDigest,
    validationResultHash,
    ruleVersions,
  });

  const assignment = await records.assign(actor, {
    operationKey: `bridge-assign-${source.packVersionId}`,
    publicationId: publication.id,
    learnerId: source.learnerId,
  });

  return {
    versionId: version.id,
    publicationId: publication.id,
    assignmentId: assignment.id,
  };
};
