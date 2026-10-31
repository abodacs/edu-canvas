import { z } from "zod";

import {
  difficultyValues,
  generationStateValues,
  languageValues,
  publicVariantSchema,
  recoveryActionValues,
} from "./generation-contract";

/**
The publication wire contract (#5). It is browser-safe: no server import. The
review projection never carries relationships, answer keys, or private
answers; those stay behind the server seam and the pack_versions private
column.
*/

export const publicationErrorCodeValues = [
  "PUBLICATION_INPUT_INVALID",
  "PUBLICATION_NOT_FOUND",
  "PUBLICATION_FORBIDDEN",
  "REVIEW_NOT_READY",
  "REVIEW_STALE",
  "MISSING_APPROVAL",
  "WARNINGS_UNACKNOWLEDGED",
  "GATE_BLOCKED",
  "GATE_STALE",
  "LEARNER_NOT_FOUND",
  "IDEMPOTENCY_CONFLICT",
  "PUBLICATION_UNAVAILABLE",
] as const;

export type PublicationErrorCode = (typeof publicationErrorCodeValues)[number];

export const publicationErrorStatusByCode = {
  PUBLICATION_INPUT_INVALID: 422,
  PUBLICATION_NOT_FOUND: 404,
  PUBLICATION_FORBIDDEN: 403,
  REVIEW_NOT_READY: 409,
  REVIEW_STALE: 409,
  MISSING_APPROVAL: 409,
  WARNINGS_UNACKNOWLEDGED: 422,
  GATE_BLOCKED: 422,
  GATE_STALE: 409,
  LEARNER_NOT_FOUND: 422,
  IDEMPOTENCY_CONFLICT: 409,
  PUBLICATION_UNAVAILABLE: 503,
} as const satisfies Record<PublicationErrorCode, number>;

export const reviewTargetKindValues = ["variant", "reverse-path"] as const;
export type ReviewTargetKind = (typeof reviewTargetKindValues)[number];

export const packVersionStateValues = [
  "ready-for-review",
  "blocked-by-validation",
] as const;
export type PackVersionState = (typeof packVersionStateValues)[number];

export const artifactGateValidatorValues = [
  "structural",
  "curriculum",
  "learning-quality",
] as const;

export const publicationFindingSchema = z
  .object({
    validator: z.enum(artifactGateValidatorValues),
    validatorVersion: z.string().min(1),
    verdict: z.enum(["warning", "hard_block"]),
    code: z.string().min(1),
    field: z.string().min(1),
    variantId: z.string().optional(),
    nodeId: z.string().optional(),
    reason: z.string().min(1),
    recovery: z.enum(recoveryActionValues),
  })
  .strict();

export type PublicationFinding = z.infer<typeof publicationFindingSchema>;

export const reviewLearningPathSchema = z
  .object({
    direction: z.literal("forward"),
    steps: z.array(
      z
        .object({
          nodeId: z.string(),
          label: z.string(),
          role: z.enum(["prerequisite", "target"]),
          screenPurposeId: z.string(),
          screenPurpose: z.string(),
        })
        .strict()
    ),
    rationale: z.string(),
    nextScreenRationale: z.string(),
  })
  .strict();

export type ReviewLearningPath = z.infer<typeof reviewLearningPathSchema>;

export const reviewApprovalSchema = z
  .object({
    targetKind: z.enum(reviewTargetKindValues),
    targetId: z.string(),
    approvingActorId: z.string(),
    approvedAt: z.string(),
  })
  .strict();

export type ReviewApproval = z.infer<typeof reviewApprovalSchema>;

export const reviewVersionSchema = z
  .object({
    id: z.string(),
    revision: z.number().int().min(1),
    state: z.enum(packVersionStateValues),
    artifactHash: z.string().regex(/^[a-f\d]{64}$/u),
    gateVerdict: z.enum(["pass", "warning", "hard_block"]),
    createdAt: z.string(),
    findings: z.array(publicationFindingSchema),
    approvals: z.array(reviewApprovalSchema),
  })
  .strict();

export type ReviewVersion = z.infer<typeof reviewVersionSchema>;

export const reviewDraftSchema = z
  .object({
    prompt: z.string(),
    grade: z.number().int(),
    standardId: z.string(),
    language: z.enum(languageValues),
    difficulty: z.enum(difficultyValues),
    variants: z.array(publicVariantSchema).length(4),
  })
  .strict();

export type ReviewDraft = z.infer<typeof reviewDraftSchema>;

const reviewProvenanceSchema = z
  .object({
    provider: z.string(),
    model: z.string(),
    promptTemplateVersion: z.string(),
    validatorVersion: z.string(),
    catalogVersion: z.string().nullable(),
    sourceSnapshotId: z.string().nullable(),
    editedAt: z.string().nullable(),
  })
  .strict();

export const reviewLearnerSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
  })
  .strict();

export type ReviewLearner = z.infer<typeof reviewLearnerSchema>;

export const reviewPackSchema = z
  .object({
    requestId: z.string(),
    recordState: z.enum(generationStateValues),
    version: reviewVersionSchema,
    draft: reviewDraftSchema,
    learningPath: reviewLearningPathSchema.nullable(),
    provenance: reviewProvenanceSchema,
    canPublish: z.boolean(),
    publishBlockers: z.array(z.string()),
    publication: z
      .object({
        id: z.string(),
        approvedAt: z.string(),
        artifactHash: z.string(),
      })
      .strict()
      .nullable(),
    assignment: z
      .object({
        id: z.string(),
        learnerId: z.string(),
        learnerDisplayName: z.string(),
      })
      .strict()
      .nullable(),
    availableLearners: z.array(reviewLearnerSchema),
  })
  .strict();

export type ReviewPack = z.infer<typeof reviewPackSchema>;

export const publicationPublishResultSchema = z
  .object({
    publicationId: z.string(),
    assignmentId: z.string(),
    review: reviewPackSchema,
  })
  .strict();

export type PublicationPublishResult = z.infer<
  typeof publicationPublishResultSchema
>;

export const publicationOpenInputSchema = z
  .object({
    requestId: z.string().trim().min(1).max(80),
  })
  .strict();

export const publicationTargetSchema = z
  .object({
    targetKind: z.enum(reviewTargetKindValues),
    targetId: z.string().trim().min(1).max(80),
  })
  .strict();

export const publicationApproveInputSchema = z
  .object({
    requestId: z.string().trim().min(1).max(80),
    versionId: z.string().trim().min(1).max(80),
    targetKind: z.enum(reviewTargetKindValues),
    targetId: z.string().trim().min(1).max(80),
    acknowledgedFindingCodes: z.array(z.string().trim().min(1).max(80)).max(50),
    operationKey: z.string().trim().min(8).max(128),
  })
  .strict();

export type PublicationApproveInput = z.infer<
  typeof publicationApproveInputSchema
>;

export const publicationEditFieldValues = [
  "sourceItem",
  "targetItem",
  "hint",
  "feedbackCorrect",
  "feedbackIncorrect",
] as const;

export type PublicationEditField = (typeof publicationEditFieldValues)[number];

export const publicationEditSchema = z.discriminatedUnion("field", [
  z
    .object({
      variantId: z.string().trim().min(1).max(80),
      field: z.literal("sourceItem"),
      index: z.number().int().min(0).max(7),
      value: z.string().trim().min(1).max(400),
    })
    .strict(),
  z
    .object({
      variantId: z.string().trim().min(1).max(80),
      field: z.literal("targetItem"),
      index: z.number().int().min(0).max(7),
      value: z.string().trim().min(1).max(400),
    })
    .strict(),
  z
    .object({
      variantId: z.string().trim().min(1).max(80),
      field: z.literal("hint"),
      index: z.number().int().min(0).max(2),
      value: z.string().trim().min(1).max(400),
    })
    .strict(),
  z
    .object({
      variantId: z.string().trim().min(1).max(80),
      field: z.literal("feedbackCorrect"),
      value: z.string().trim().min(1).max(400),
    })
    .strict(),
  z
    .object({
      variantId: z.string().trim().min(1).max(80),
      field: z.literal("feedbackIncorrect"),
      value: z.string().trim().min(1).max(400),
    })
    .strict(),
]);

export type PublicationEdit = z.infer<typeof publicationEditSchema>;

export const publicationReviseInputSchema = z
  .object({
    requestId: z.string().trim().min(1).max(80),
    versionId: z.string().trim().min(1).max(80),
    expectedArtifactHash: z.string().regex(/^[a-f\d]{64}$/u),
    edits: z.array(publicationEditSchema).min(1).max(8),
    operationKey: z.string().trim().min(8).max(128),
  })
  .strict();

export type PublicationReviseInput = z.infer<
  typeof publicationReviseInputSchema
>;

export const publicationPublishInputSchema = z
  .object({
    requestId: z.string().trim().min(1).max(80),
    versionId: z.string().trim().min(1).max(80),
    expectedArtifactHash: z.string().regex(/^[a-f\d]{64}$/u),
    learnerId: z.string().trim().min(1).max(80),
    operationKey: z.string().trim().min(8).max(128),
  })
  .strict();

export type PublicationPublishInput = z.infer<
  typeof publicationPublishInputSchema
>;

export const publicationActionValues = [
  "open-review",
  "approve-target",
  "revise-version",
  "publish",
] as const;

export type PublicationAction = (typeof publicationActionValues)[number];

export const reversePathTargetId = "learning-path" as const;
