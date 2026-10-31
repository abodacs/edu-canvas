import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical-json";
import { hashVersion } from "./vocabulary";

export const hashHexPattern = /^[a-f0-9]{64}$/u;

const sha256 = (value: unknown): string =>
  createHash("sha256").update(canonicalJson(value), "utf-8").digest("hex");

export interface CuratedContentHashInput {
  readonly standardId: string;
  readonly referenceKey: string;
  readonly referenceVersion: string;
  readonly reviewedContent: unknown;
}

export const createCuratedContentHash = (
  input: CuratedContentHashInput
): string => {
  return sha256({
    hashVersion,
    kind: "curated-reference",
    standardId: input.standardId,
    referenceKey: input.referenceKey,
    referenceVersion: input.referenceVersion,
    reviewedContent: input.reviewedContent,
  });
};

export interface VersionContentHashInput {
  readonly conceptIds: readonly string[];
  readonly sections: unknown;
  readonly variantReferences: unknown;
}

export const createContentHash = (input: VersionContentHashInput): string => {
  return sha256({
    hashVersion,
    kind: "lesson-content",
    conceptIds: input.conceptIds,
    sections: input.sections,
    variantReferences: input.variantReferences,
  });
};

export const createPrivateAnswerDigest = (relationships: unknown): string => {
  return sha256({
    hashVersion,
    kind: "private-answer-relationships",
    relationships,
  });
};

export const createPackageHash = (input: {
  readonly contentHash: string;
  readonly privateAnswerDigest: string;
}): string => {
  return sha256({
    hashVersion,
    kind: "lesson-package",
    contentHash: input.contentHash,
    privateAnswerDigest: input.privateAnswerDigest,
  });
};

export const createValidationResultHash = (
  validationResult: unknown
): string => {
  return sha256({
    hashVersion,
    kind: "validation-result",
    validationResult,
  });
};

export const createInputHash = (input: unknown): string => {
  return sha256({
    hashVersion,
    kind: "operation-input",
    input,
  });
};

export interface EvidenceHashInput {
  readonly runId: string;
  readonly publicationId: string;
  readonly learnerId: string;
  readonly attempts: unknown;
  readonly assistanceEvents: unknown;
}

export const createEvidenceHash = (input: EvidenceHashInput): string => {
  return sha256({
    hashVersion,
    kind: "learner-evidence",
    runId: input.runId,
    publicationId: input.publicationId,
    learnerId: input.learnerId,
    attempts: input.attempts,
    assistanceEvents: input.assistanceEvents,
  });
};
