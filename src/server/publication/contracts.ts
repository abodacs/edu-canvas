import { z } from "zod";

import { A2UI_CATALOG_VERSION } from "@/shared/a2ui-contract";
import {
  difficultyValues,
  languageValues,
  publicVariantSchema,
  recoveryActionValues,
  semanticValidationVerdictValues,
} from "@/shared/generation-contract";
import {
  publicationEditFieldValues,
  publicationFindingSchema,
} from "@/shared/publication-contract";
import {
  a2uiCompileGuardVersion,
  gateArtifact,
  snapshotArtifactGateResult,
} from "@/server/safety/artifact-gate";
import { artifactGateSnapshotSchema } from "@/server/safety/artifact-gate-contract";
import {
  validateProviderDraft,
  validatorVersion as lessonValidatorVersion,
} from "@/server/generation/validation";
import { createId } from "@/server/ids";
import { publicationError } from "./errors";
import { createCanonicalHash } from "./hashes";
import type { ArtifactGateSnapshot } from "@/server/safety/artifact-gate-contract";
import type {
  ArtifactGateResult,
  RenderableArtifact,
} from "@/server/safety/artifact-gate";

import type {
  GenerationDiagnostic,
  LessonGenerationRecord,
  ProviderVariant,
  ValidatedLearningPath,
} from "@/server/generation/types";
import type {
  PublicationEdit,
  PublicationFinding,
} from "@/shared/publication-contract";
import type { PackVersionRecord } from "@/server/persistence/pack-port";

const initialRevision = 1;
const readyForReviewState = "ready-for-review";

export const packVersionSchemaVersion = "pack-version-v1";

const storedRelationshipSchema = z
  .object({
    id: z.string(),
    sourceId: z.string(),
    targetId: z.string(),
  })
  .strict();

export const storedLearningPathSchema = z
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
    versionPins: z
      .object({
        draftId: z.string(),
        graphVersion: z.string(),
        catalogVersion: z.string(),
        modelVersion: z.string(),
        validatorVersion: z.string(),
      })
      .strict(),
  })
  .strict();

export const publicContentSchema = z
  .object({
    input: z
      .object({
        prompt: z.string().min(1).max(500),
        grade: z.number().int().min(3).max(6),
        standardId: z.string().min(1).max(80),
        language: z.enum(languageValues),
        difficulty: z.enum(difficultyValues),
      })
      .strict(),
    variants: z.array(publicVariantSchema).length(4),
    learningPath: storedLearningPathSchema,
  })
  .strict();

export type StoredPublicContent = z.infer<typeof publicContentSchema>;

export const privateAnswersSchema = z
  .object({
    variants: z
      .array(
        z
          .object({
            variantId: z.string(),
            relationships: z.array(storedRelationshipSchema).min(1),
          })
          .strict()
      )
      .length(4),
  })
  .strict();

export type StoredPrivateAnswers = z.infer<typeof privateAnswersSchema>;

const storedDiagnosticSchema = z
  .object({
    severity: z.enum(["warning", "error"]),
    code: z.string(),
    message: z.string(),
    variantId: z.string().optional(),
    field: z.string().optional(),
    nodeId: z.string().optional(),
    validator: z.enum(["curriculum", "learning-quality"]).optional(),
    verdict: z.enum(semanticValidationVerdictValues).optional(),
    validatorVersion: z.string().optional(),
    recommendation: z.string().optional(),
    recovery: z.enum(recoveryActionValues).optional(),
  })
  .strict();

export const validationResultSchema = z
  .object({
    validatorVersion: z.string(),
    findings: z.array(publicationFindingSchema),
    diagnostics: z.array(storedDiagnosticSchema),
  })
  .strict();

export type StoredValidationResult = z.infer<typeof validationResultSchema>;

export const ruleVersionsSchema = z
  .object({
    validatorVersion: z.string(),
    catalogVersion: z.string(),
    graphVersion: z.string(),
    artifactGatePolicyVersion: z.string(),
    a2uiCompileGuardVersion: z.string(),
  })
  .strict();

export type StoredRuleVersions = z.infer<typeof ruleVersionsSchema>;

export const storedProvenanceSchema = z
  .object({
    provider: z.string(),
    model: z.string(),
    promptTemplateVersion: z.string(),
    validatorVersion: z.string(),
    catalogVersion: z.string().nullable(),
    sourceSnapshotId: z.string().nullable(),
    editedAt: z.string().nullable(),
    authoredEdits: z.array(
      z
        .object({
          variantId: z.string(),
          field: z.enum(publicationEditFieldValues),
          index: z.number().int().nullable(),
          actorId: z.string(),
          editedAt: z.string(),
        })
        .strict()
    ),
  })
  .strict();

export type StoredProvenance = z.infer<typeof storedProvenanceSchema>;

export interface DecodedPackVersion {
  publicContent: StoredPublicContent;
  privateAnswers: StoredPrivateAnswers;
  gateSnapshot: ArtifactGateSnapshot | null;
  validationResult: StoredValidationResult;
  ruleVersions: StoredRuleVersions;
  provenance: StoredProvenance;
}

export interface ArtifactGateDerivation {
  validationDiagnostics: readonly GenerationDiagnostic[];
  gate: ArtifactGateResult;
}

const stripRelationships = (
  variant: ProviderVariant
): StoredPublicContent["variants"][number] => {
  return {
    id: variant.id,
    kind: variant.kind,
    title: variant.title,
    instructions: variant.instructions,
    sourceItems: variant.sourceItems,
    targetItems: variant.targetItems,
    distractorItems: variant.distractorItems,
    hints: variant.hints,
    feedback: variant.feedback,
    languageMetadata: variant.languageMetadata,
    accessibilityMetadata: variant.accessibilityMetadata,
  };
};

export const rebuildProviderVariants = (
  content: StoredPublicContent,
  answers: StoredPrivateAnswers
): ProviderVariant[] => {
  return content.variants.map((variant) => {
    const answer = answers.variants.find(
      (candidate) => candidate.variantId === variant.id
    );
    if (!answer) {
      throw publicationError(
        "REVIEW_STALE",
        "The stored revision lost a variant's private answer relationship."
      );
    }
    return {
      ...variant,
      relationships: answer.relationships.map((relationship) => {
        return {
          id: relationship.id,
          sourceId: relationship.sourceId,
          targetId: relationship.targetId,
        };
      }),
    };
  });
};

export const deriveArtifactGate = (
  variants: ProviderVariant[],
  learningPath: ValidatedLearningPath,
  expectedLanguage: StoredPublicContent["input"]["language"]
): ArtifactGateDerivation => {
  const validation = validateProviderDraft({ variants }, { expectedLanguage });
  const gate = gateArtifact({
    kind: "lesson",
    draft: { variants },
    learningPath,
    structuralDiagnostics: validation.diagnostics,
  });
  return { validationDiagnostics: validation.diagnostics, gate };
};

export const decodePackVersion = (
  version: PackVersionRecord
): DecodedPackVersion => {
  return {
    publicContent: publicContentSchema.parse(version.publicContent),
    privateAnswers: privateAnswersSchema.parse(version.privateAnswers),
    gateSnapshot:
      version.gateSnapshot === null
        ? null
        : artifactGateSnapshotSchema.parse(version.gateSnapshot),
    validationResult: validationResultSchema.parse(version.validationResult),
    ruleVersions: ruleVersionsSchema.parse(version.ruleVersions),
    provenance: storedProvenanceSchema.parse(version.provenance),
  };
};

export interface PackVersionWrite {
  id: string;
  tenantId: string;
  schemaVersion: string;
  requestId: string;
  teacherActorId: string;
  revision: number;
  state: "ready-for-review" | "blocked-by-validation";
  parentVersionId: string | null;
  sourceArtifactHash: string;
  artifactHash: string;
  gateVerdict: "pass" | "warning" | "hard_block";
  gateSnapshot: ArtifactGateSnapshot | null;
  validationResult: StoredValidationResult;
  validationResultHash: string;
  ruleVersions: StoredRuleVersions;
  provenance: StoredProvenance;
  publicContent: StoredPublicContent;
  privateAnswers: StoredPrivateAnswers;
  contentHash: string;
  privateAnswerDigest: string;
  createdAt: string;
}

const provenanceFromRecord = (
  record: LessonGenerationRecord
): StoredProvenance => {
  return {
    provider: record.provenance?.provider ?? "unknown",
    model: record.provenance?.model ?? "unknown",
    promptTemplateVersion:
      record.provenance?.promptTemplateVersion ?? "unknown",
    validatorVersion:
      record.provenance?.validatorVersion ?? lessonValidatorVersion,
    catalogVersion: record.provenance?.catalogVersion ?? null,
    sourceSnapshotId: record.input.sourceSnapshotId ?? null,
    editedAt: null,
    authoredEdits: [],
  };
};

const ruleVersionsFromRecord = (
  record: LessonGenerationRecord,
  learningPath: ValidatedLearningPath,
  gate: ArtifactGateSnapshot
): StoredRuleVersions => {
  return {
    validatorVersion:
      record.provenance?.validatorVersion ?? lessonValidatorVersion,
    catalogVersion: record.provenance?.catalogVersion ?? A2UI_CATALOG_VERSION,
    graphVersion: learningPath.versionPins.graphVersion,
    artifactGatePolicyVersion: gate.policyVersion,
    a2uiCompileGuardVersion,
  };
};

export const buildInitialVersion = (
  record: LessonGenerationRecord,
  options: { revision: number; parentVersionId: string | null; now: string }
): PackVersionWrite => {
  const { gate } = record;
  if (!gate || record.state !== readyForReviewState) {
    throw publicationError(
      "REVIEW_NOT_READY",
      "Only a ready-for-review draft with an accepted safety-gate snapshot can be reviewed."
    );
  }
  if (!record.draft) {
    throw publicationError(
      "REVIEW_NOT_READY",
      "This draft has no lesson artifact to review. Fraction-pinned and blocked drafts stay outside the generated-pack path."
    );
  }

  const content = publicContentSchema.parse({
    input: {
      prompt: record.input.prompt,
      grade: record.input.grade,
      standardId: record.input.standardId,
      language: record.input.language,
      difficulty: record.input.difficulty,
    },
    variants: record.draft.variants.map(stripRelationships),
    learningPath: record.draft.learningPath,
  });
  const answers = privateAnswersSchema.parse({
    variants: record.draft.variants.map((variant) => {
      return {
        variantId: variant.id,
        relationships: variant.relationships,
      };
    }),
  });
  const rebuilt = rebuildProviderVariants(content, answers);
  const derived = deriveArtifactGate(
    rebuilt,
    record.draft.learningPath,
    record.input.language
  );

  if (
    derived.gate.artifactHash !== gate.artifactHash ||
    derived.gate.policyVersion !== gate.policyVersion ||
    derived.gate.verdict === "hard_block"
  ) {
    throw publicationError(
      "GATE_STALE",
      "The accepted safety-gate snapshot no longer matches the stored draft. Re-derive the gate before reviewing."
    );
  }

  const validationResult: StoredValidationResult = {
    validatorVersion:
      record.provenance?.validatorVersion ?? lessonValidatorVersion,
    findings: [...gate.findings],
    diagnostics: record.diagnostics.map((diagnostic) => {
      return {
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
        ...(diagnostic.variantId && { variantId: diagnostic.variantId }),
        ...(diagnostic.field && { field: diagnostic.field }),
        ...(diagnostic.nodeId && { nodeId: diagnostic.nodeId }),
        ...(diagnostic.validator && { validator: diagnostic.validator }),
        ...(diagnostic.verdict && { verdict: diagnostic.verdict }),
        ...(diagnostic.validatorVersion && {
          validatorVersion: diagnostic.validatorVersion,
        }),
        ...(diagnostic.recommendation && {
          recommendation: diagnostic.recommendation,
        }),
        ...(diagnostic.recovery && { recovery: diagnostic.recovery }),
      };
    }),
  };

  return {
    id: createId(),
    tenantId: record.tenantId,
    schemaVersion: packVersionSchemaVersion,
    requestId: record.requestId,
    teacherActorId: record.teacherId,
    revision: options.revision,
    state: readyForReviewState,
    parentVersionId: options.parentVersionId,
    sourceArtifactHash: gate.artifactHash,
    artifactHash: gate.artifactHash,
    gateVerdict: gate.verdict,
    gateSnapshot: gate,
    validationResult,
    validationResultHash: createCanonicalHash(validationResult),
    ruleVersions: ruleVersionsFromRecord(
      record,
      record.draft.learningPath,
      gate
    ),
    provenance: provenanceFromRecord(record),
    publicContent: content,
    privateAnswers: answers,
    contentHash: createCanonicalHash(content),
    privateAnswerDigest: createCanonicalHash(answers),
    createdAt: options.now,
  };
};

const replaceAt = <T>(items: readonly T[], index: number, value: T): T[] => {
  if (index < 0 || index >= items.length) {
    throw publicationError(
      "PUBLICATION_INPUT_INVALID",
      "The edit points at an item that is not in this variant."
    );
  }
  return items.map((item, position) => (position === index ? value : item));
};

const applyEdit = (
  variants: readonly ProviderVariant[],
  edit: PublicationEdit
): ProviderVariant[] => {
  const variantIndex = variants.findIndex(
    (variant) => variant.id === edit.variantId
  );
  const variant = variants[variantIndex];
  if (!variant) {
    throw publicationError(
      "PUBLICATION_INPUT_INVALID",
      `The edited variant ${edit.variantId} is not part of this revision.`
    );
  }

  switch (edit.field) {
    case "sourceItem": {
      const item = variant.sourceItems[edit.index];
      if (!item) {
        throw publicationError(
          "PUBLICATION_INPUT_INVALID",
          "The edit points at a source item that is not in this variant."
        );
      }
      return variants.map((candidate, position) => {
        return position === variantIndex
          ? {
              ...candidate,
              sourceItems: replaceAt(candidate.sourceItems, edit.index, {
                ...item,
                label: edit.value,
              }),
            }
          : candidate;
      });
    }
    case "targetItem": {
      const item = variant.targetItems[edit.index];
      if (!item) {
        throw publicationError(
          "PUBLICATION_INPUT_INVALID",
          "The edit points at a target item that is not in this variant."
        );
      }
      return variants.map((candidate, position) => {
        return position === variantIndex
          ? {
              ...candidate,
              targetItems: replaceAt(candidate.targetItems, edit.index, {
                ...item,
                label: edit.value,
              }),
            }
          : candidate;
      });
    }
    case "hint": {
      if (edit.index >= variant.hints.length) {
        throw publicationError(
          "PUBLICATION_INPUT_INVALID",
          "The edit points at a hint that is not in this variant."
        );
      }
      return variants.map((candidate, position) => {
        return position === variantIndex
          ? {
              ...candidate,
              hints: replaceAt(candidate.hints, edit.index, edit.value),
            }
          : candidate;
      });
    }
    case "feedbackCorrect": {
      return variants.map((candidate, position) => {
        return position === variantIndex
          ? {
              ...candidate,
              feedback: { ...candidate.feedback, correct: edit.value },
            }
          : candidate;
      });
    }
    case "feedbackIncorrect": {
      return variants.map((candidate, position) => {
        return position === variantIndex
          ? {
              ...candidate,
              feedback: { ...candidate.feedback, incorrect: edit.value },
            }
          : candidate;
      });
    }
    default: {
      const exhaustive: never = edit;
      throw publicationError(
        "PUBLICATION_INPUT_INVALID",
        `Unhandled edit field: ${String(exhaustive)}`
      );
    }
  }
};

export const applyPublicationEdits = (
  variants: readonly ProviderVariant[],
  edits: readonly PublicationEdit[]
): ProviderVariant[] => {
  let edited = [...variants];
  for (const edit of edits) {
    edited = applyEdit(edited, edit);
  }
  return edited;
};

export const buildEditedVersion = (
  current: PackVersionRecord,
  decoded: DecodedPackVersion,
  edits: readonly PublicationEdit[],
  actorId: string,
  now: string
): PackVersionWrite => {
  const currentVariants = rebuildProviderVariants(
    decoded.publicContent,
    decoded.privateAnswers
  );
  const editedVariants = applyPublicationEdits(currentVariants, edits);
  const derived = deriveArtifactGate(
    editedVariants,
    decoded.publicContent.learningPath,
    decoded.publicContent.input.language
  );

  if (derived.gate.verdict === "hard_block" || !derived.gate.renderable) {
    throw publicationError(
      "GATE_BLOCKED",
      "This edit breaks the lesson's safety or validation rules. Resolve the findings before approving it.",
      { findings: derived.gate.findings }
    );
  }

  const content = publicContentSchema.parse({
    ...decoded.publicContent,
    variants: editedVariants.map(stripRelationships),
  });
  const answers = privateAnswersSchema.parse({
    variants: editedVariants.map((variant) => {
      return {
        variantId: variant.id,
        relationships: variant.relationships,
      };
    }),
  });
  const snapshot = snapshotArtifactGateResult(derived.gate);
  const validationResult: StoredValidationResult = {
    validatorVersion: decoded.ruleVersions.validatorVersion,
    findings: [...derived.gate.findings],
    diagnostics: derived.validationDiagnostics.map((diagnostic) => {
      return {
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
        ...(diagnostic.variantId && { variantId: diagnostic.variantId }),
        ...(diagnostic.field && { field: diagnostic.field }),
        ...(diagnostic.nodeId && { nodeId: diagnostic.nodeId }),
        ...(diagnostic.validator && { validator: diagnostic.validator }),
        ...(diagnostic.verdict && { verdict: diagnostic.verdict }),
        ...(diagnostic.validatorVersion && {
          validatorVersion: diagnostic.validatorVersion,
        }),
        ...(diagnostic.recommendation && {
          recommendation: diagnostic.recommendation,
        }),
        ...(diagnostic.recovery && { recovery: diagnostic.recovery }),
      };
    }),
  };
  const provenance: StoredProvenance = {
    ...decoded.provenance,
    editedAt: now,
    authoredEdits: [
      ...decoded.provenance.authoredEdits,
      ...edits.map((edit) => {
        return {
          variantId: edit.variantId,
          field: edit.field,
          index: "index" in edit ? edit.index : null,
          actorId,
          editedAt: now,
        };
      }),
    ],
  };

  return {
    id: createId(),
    tenantId: current.tenantId,
    schemaVersion: packVersionSchemaVersion,
    requestId: current.requestId,
    teacherActorId: current.teacherActorId,
    revision: current.revision + initialRevision,
    state: readyForReviewState,
    parentVersionId: current.id,
    sourceArtifactHash: current.sourceArtifactHash,
    artifactHash: derived.gate.artifactHash,
    gateVerdict: derived.gate.verdict,
    gateSnapshot: snapshot,
    validationResult,
    validationResultHash: createCanonicalHash(validationResult),
    ruleVersions: {
      ...decoded.ruleVersions,
      artifactGatePolicyVersion: derived.gate.policyVersion,
    },
    provenance,
    publicContent: content,
    privateAnswers: answers,
    contentHash: createCanonicalHash(content),
    privateAnswerDigest: createCanonicalHash(answers),
    createdAt: now,
  };
};

export interface VersionArtifact {
  variants: ProviderVariant[];
  learningPath: ValidatedLearningPath;
  gate: Extract<ArtifactGateResult, { renderable: RenderableArtifact }>;
  snapshot: ArtifactGateSnapshot;
}

export const deriveVersionArtifact = (
  version: PackVersionRecord,
  decoded: DecodedPackVersion
): VersionArtifact => {
  const variants = rebuildProviderVariants(
    decoded.publicContent,
    decoded.privateAnswers
  );
  const derived = deriveArtifactGate(
    variants,
    decoded.publicContent.learningPath,
    decoded.publicContent.input.language
  );
  const gateResult = derived.gate;

  if (gateResult.verdict === "hard_block" || !gateResult.renderable) {
    throw publicationError(
      "GATE_BLOCKED",
      "This revision is hard-blocked by the safety gate. Resolve the findings before publishing.",
      { findings: gateResult.findings }
    );
  }

  if (
    gateResult.artifactHash !== version.artifactHash ||
    gateResult.policyVersion !== decoded.gateSnapshot?.policyVersion
  ) {
    throw publicationError(
      "GATE_STALE",
      "The safety-gate result no longer matches this revision. Reopen the review before publishing."
    );
  }

  return {
    variants,
    learningPath: decoded.publicContent.learningPath,
    gate: gateResult,
    snapshot: decoded.gateSnapshot ?? snapshotArtifactGateResult(gateResult),
  };
};

export const publicFindings = (
  findings: readonly PublicationFinding[]
): PublicationFinding[] => {
  return findings.map((finding) => {
    return {
      validator: finding.validator,
      validatorVersion: finding.validatorVersion,
      verdict: finding.verdict,
      code: finding.code,
      field: finding.field,
      ...(finding.variantId && { variantId: finding.variantId }),
      ...(finding.nodeId && { nodeId: finding.nodeId }),
      reason: finding.reason,
      recovery: finding.recovery,
    };
  });
};

export { initialRevision };
