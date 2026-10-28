import type { TeacherActor } from "@/server/identity/types";
import type {
  LessonDifficulty,
  LessonLanguage,
  PublicGenerationResult,
} from "@/shared/generation-contract";

export interface NormalizedGenerationRequest {
  prompt: string;
  grade: number;
  standardId: string;
  language: LessonLanguage;
  difficulty: LessonDifficulty;
}

export interface ProviderProvenance {
  provider: string;
  model: string;
  promptTemplateVersion: string;
  validatorVersion: string;
  catalogVersion?: string;
}

export const variantKindValues = ["standard", "scaffold", "challenge"] as const;

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
  verdict?: "pass" | "warning" | "block";
  validatorVersion?: string;
  recommendation?: string;
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

export type GenerationState =
  | "requested"
  | "generating"
  | "ready-for-review"
  | "blocked-by-validation"
  | "blocked-by-moderation"
  | "failed-retryable"
  | "failed-terminal";

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
  input: unknown;
}

export interface GenerationServiceResult {
  record: LessonGenerationRecord;
  publicResult: PublicGenerationResult;
}
