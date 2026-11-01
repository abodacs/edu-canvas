import type { TeacherActor } from "@/server/identity/types";
import type { ArtifactGateSnapshot } from "@/server/safety/artifact-gate-contract";
import type {
  generationStateValues,
  LessonDifficulty,
  LessonLanguage,
  ModerationCategory,
  PublicGenerationResult,
  RecoveryAction,
  SemanticValidationVerdict,
  variantKindValues,
  LessonGenerationInput,
} from "@/shared/generation-contract";
import type { FractionLessonDraft } from "@/shared/fractions-contract";

export interface NormalizedGenerationRequest {
  prompt: string;
  grade: number;
  standardId: string;
  language: LessonLanguage;
  difficulty: LessonDifficulty;
  /**
  The reviewed, complete source snapshot this request is grounded in (#114).
  Absent for prompt-only requests; the focused event composer never sends it.
  */
  sourceSnapshotId?: string;
}

export interface ProviderProvenance {
  provider: string;
  model: string;
  promptTemplateVersion: string;
  validatorVersion: string;
  catalogVersion?: string;
}

export type VariantKind = (typeof variantKindValues)[number];

export interface ProviderItem {
  id: string;
  label: string;
}

export interface ProviderRelationship {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface ProviderVariant {
  id: string;
  kind: VariantKind;
  title: string;
  instructions: string;
  sourceItems: ProviderItem[];
  targetItems: ProviderItem[];
  distractorItems: ProviderItem[];
  relationships: ProviderRelationship[];
  hints: string[];
  feedback: {
    correct: string;
    incorrect: string;
  };
  languageMetadata: {
    language: "en" | "ar";
    direction: "ltr" | "rtl";
    locale: string;
  };
  accessibilityMetadata: {
    instructions: string;
    sourceGroupLabel: string;
    targetGroupLabel: string;
  };
}

export interface ProviderLearningPathStep {
  nodeId: string;
  screenPurposeId: string;
}

export interface ProviderLearningPath {
  direction: "forward" | "reverse";
  steps: ProviderLearningPathStep[];
  rationale: string;
  nextScreenRationale: string;
}

export type LearningPathStepRole = "prerequisite" | "target";

export interface ValidatedLearningPathStep {
  nodeId: string;
  label: string;
  role: LearningPathStepRole;
  screenPurposeId: string;
  screenPurpose: string;
}

export interface LearningPathVersionPins {
  draftId: string;
  graphVersion: string;
  catalogVersion: string;
  modelVersion: string;
  validatorVersion: string;
}

export interface ValidatedLearningPath {
  direction: "forward";
  steps: ValidatedLearningPathStep[];
  rationale: string;
  nextScreenRationale: string;
  versionPins: LearningPathVersionPins;
}

export interface ProviderLessonDraft {
  variants: ProviderVariant[];
  learningPath?: ProviderLearningPath;
}

export interface LessonDraft extends Omit<ProviderLessonDraft, "learningPath"> {
  learningPath: ValidatedLearningPath;
  requestId: string;
  input: NormalizedGenerationRequest;
  provenance: ProviderProvenance;
  createdAt: string;
}

export type DiagnosticSeverity = "warning" | "error";

export interface GenerationDiagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  variantId?: string;
  field?: string;
  nodeId?: string;
  validator?: "curriculum" | "learning-quality";
  verdict?: SemanticValidationVerdict;
  validatorVersion?: string;
  recommendation?: string;
  /**
   * #28: the single teacher action for this finding, carried from the artifact
   * gate so a blocked teacher sees the way out with the reason.
   */
  recovery?: RecoveryAction;
  /**
   * #132: the moderation category behind a block. It is teacher-safe and it
   * never carries the rule set, the matched text, or the internal code.
   */
  moderationCategory?: ModerationCategory;
}

export interface ValidationSuccess {
  ok: true;
  draft: ProviderLessonDraft;
  diagnostics: GenerationDiagnostic[];
}

export interface ValidationFailure {
  ok: false;
  diagnostics: GenerationDiagnostic[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export type GenerationState = (typeof generationStateValues)[number];

export interface GenerationAttemptRecord {
  attemptNumber: number;
  idempotencyKey: string;
  requestHash: string;
  state: GenerationState;
  correctionAttempted: boolean;
  diagnostics: GenerationDiagnostic[];
  provenance?: ProviderProvenance;
  createdAt: string;
}

export interface LessonGenerationRecord {
  requestId: string;
  tenantId: string;
  teacherId: string;
  input: NormalizedGenerationRequest;
  state: GenerationState;
  attempt: number;
  diagnostics: GenerationDiagnostic[];
  provenance?: ProviderProvenance;
  draft?: LessonDraft | null;
  // #116: a fraction-pinned record hydrates its draft here, leaving the
  // matching draft contract untouched for every existing consumer.
  fractionDraft?: FractionLessonDraft | null;
  /**
   * #28: acceptance evidence. Present only on a `ready-for-review` record; a
   * missing snapshot refuses preview and Share. Persisted beside the draft.
   */
  gate?: ArtifactGateSnapshot | null;
  attempts: GenerationAttemptRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface GenerationClaim {
  claimed: boolean;
  record: LessonGenerationRecord;
}

export interface GenerationWriteExpectation {
  attempt: number;
  updatedAt: string;
  /**
   * The write must also prove that the claim lease is still active. The value
   * is the oldest `updatedAt` that remains inside the lease; a stale owner
   * cannot commit a write after this instant even when no replacement exists.
   */
  leaseValidAfter: string;
}

export const generationPerCallBudgetMs = 100_000;
export const generationTotalBudgetMs = 200_000;
export const generationClaimLeaseMs = 220_000;
export const generationDuplicateWaitMs = 5000;

export interface GenerationDeadlines {
  perCallMs: number;
  totalMs: number;
  leaseMs: number;
}

export const defaultGenerationDeadlines: GenerationDeadlines = {
  perCallMs: generationPerCallBudgetMs,
  totalMs: generationTotalBudgetMs,
  leaseMs: generationClaimLeaseMs,
};

/**
 * Canonical hash of the normalized request metadata. The operation key reuses its original result only when this hash matches exactly.
 */
export const createGenerationRequestHash = (
  input: NormalizedGenerationRequest
): string => {
  const canonical = JSON.stringify([
    input.prompt,
    input.grade,
    input.standardId,
    input.language,
    input.difficulty,
    input.sourceSnapshotId ?? null,
  ]);
  let hash = 2_166_136_261;
  for (const character of canonical) {
    // eslint-disable-next-line no-bitwise -- FNV-1a mixing step.
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return Math.abs(hash).toString(36);
};

export const isGenerationClaimExpired = (
  record: LessonGenerationRecord,
  now = Date.now()
): boolean => {
  if (record.state !== "generating") {
    return false;
  }
  const updatedAt = Date.parse(record.updatedAt);
  return (
    Number.isFinite(updatedAt) && now - updatedAt >= generationClaimLeaseMs
  );
};

export const generationClaimExpiredDiagnostic = (): GenerationDiagnostic => {
  return {
    severity: "error",
    code: "GENERATION_CLAIM_EXPIRED",
    message:
      "The previous generation attempt expired before completion. Try this draft again.",
  };
};

/**
The claim insert requires a curriculum standard row for the classroom's
tenant. A tenant that has no such row makes the claim impossible, and the
database says so with the `lesson_draft_requests_tenant_id_standard_id_fkey`
foreign key (23503). Persistence detects that signature and raises this typed
signal instead of a raw driver error (#168 P0-2).
*/
export class StandardNotConfiguredError extends Error {
  constructor() {
    super("The classroom has no curriculum standard row for this request.");
    this.name = "StandardNotConfiguredError";
  }
}

export interface GenerationPersistence {
  saveGeneration: (
    record: LessonGenerationRecord,
    expected: GenerationWriteExpectation
  ) => Promise<boolean>;
  claimGeneration: (record: LessonGenerationRecord) => Promise<GenerationClaim>;
  expireGenerationClaim: (
    tenantId: string,
    requestId: string,
    expectedUpdatedAt: string,
    updatedAt: string
  ) => Promise<LessonGenerationRecord | undefined>;
  findGenerationByIdempotencyKey: (
    tenantId: string,
    teacherId: string,
    idempotencyKey: string
  ) => Promise<LessonGenerationRecord | undefined>;
  findModeratedGeneration: (
    tenantId: string,
    teacherId: string,
    requestHash: string
  ) => Promise<LessonGenerationRecord | undefined>;
  readGeneration: (
    tenantId: string,
    requestId: string
  ) => Promise<LessonGenerationRecord | undefined>;
}

export interface GenerationCommand {
  /**
  Only a verified teacher actor may generate drafts; learners cannot compile.
  */
  actor: TeacherActor;
  /**
  The delivery seam parses the request body with `lessonGenerationInputSchema`,
  so a command carries a value that already crossed that boundary.
  */
  input: LessonGenerationInput;
}

export interface GenerationServiceResult {
  record: LessonGenerationRecord;
  publicResult: PublicGenerationResult;
}
