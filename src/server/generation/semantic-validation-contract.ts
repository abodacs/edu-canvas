import { standardsPackRegistry } from "@/server/curriculum/registry";
import { syntheticSeed } from "@/server/seed-data";
import type {
  AnswerRule,
  StandardsPack,
  StandardsPackReference,
} from "@/server/curriculum/standards-pack";
import type {
  LessonLanguage,
  RecoveryAction,
  SemanticValidationVerdict,
} from "@/shared/generation-contract";

import type { NormalizedGenerationRequest } from "./provider";
import type { ProviderLessonDraft } from "./types";

export const curriculumValidatorVersion = "curriculum-validator-v1";
export const learningQualityValidatorVersion = "learning-quality-validator-v1";
export const semanticValidationRunnerVersion = "semantic-validation-runner-v1";

export type SemanticValidatorRole = "curriculum" | "learning-quality";
export type SemanticValidationStatus = "complete" | "retryable";

export interface CurriculumNode {
  id: string;
  label: string;
  sequence: number;
  screenPurposeId: string;
  screenPurpose: string;
  labelAr?: string;
  screenPurposeAr?: string;
}

export interface CurriculumEdge {
  prerequisiteId: string;
  successorId: string;
}

export interface VersionedCurriculumContext {
  tenantId: string;
  standardId: string;
  standardCode: string;
  grade: number;
  language: LessonLanguage;
  packVersion: string;
  graphVersion: string;
  targetNodeId: string;
  nodes: readonly CurriculumNode[];
  edges: readonly CurriculumEdge[];
  answerRules: readonly AnswerRule[];
  allowedScreenPatterns: readonly "matching"[];
  reference?: StandardsPackReference;
}

export interface NormalizedReasoningPath {
  direction: "forward" | "reverse";
  nodeIds: readonly string[];
  screenPurposeIds?: readonly string[];
}

export interface SemanticValidationInput {
  draft: ProviderLessonDraft;
  context: VersionedCurriculumContext;
  path?: NormalizedReasoningPath;
}

interface SemanticValidationFindingBase {
  validator: SemanticValidatorRole;
  validatorVersion: string;
  code: string;
  field: string;
  reason: string;
  variantId?: string;
  nodeId?: string;
  recommendation?: string;
}

export type SemanticValidationFinding =
  | (SemanticValidationFindingBase & { verdict: "pass" })
  | (SemanticValidationFindingBase & {
      verdict: "warning" | "hard_block";
      recovery: RecoveryAction;
    });

export interface SemanticValidatorReview {
  validator: SemanticValidatorRole;
  validatorVersion: string;
  verdict: SemanticValidationVerdict;
  field: string;
  nodeId?: string;
  reason: string;
  findings: readonly SemanticValidationFinding[];
}

interface SemanticValidationReportBase {
  status: SemanticValidationStatus;
  reviews: readonly SemanticValidatorReview[];
  findings: readonly SemanticValidationFinding[];
  retry: {
    available: boolean;
    message: string;
  };
}

export type SemanticValidationReport =
  | (SemanticValidationReportBase & { verdict: "pass"; recovery: null })
  | (SemanticValidationReportBase & {
      verdict: "warning" | "hard_block";
      recovery: RecoveryAction;
    });

export interface SemanticAgentRecommendation {
  verdict: SemanticValidationVerdict;
  code: string;
  field?: string;
  reason: string;
  variantId?: string;
  nodeId?: string;
  recommendation?: string;
}

export interface SemanticValidationAgent {
  role: SemanticValidatorRole;
  version: string;
  review: (
    input: SemanticValidationInput,
    signal: AbortSignal
  ) => Promise<readonly SemanticAgentRecommendation[]>;
}

export interface SemanticValidationOptions {
  recommendationAgents?: readonly SemanticValidationAgent[];
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
}

/**
 * A resolved pack is the only source of a curriculum context. The acting
 * tenant owns the context even when the pack is a shared template, so the
 * acceptance tenant check still proves the lesson belongs to this classroom.
 */
export const createCurriculumContextFromPack = (
  pack: StandardsPack,
  input: Pick<NormalizedGenerationRequest, "grade" | "language">,
  tenantId: string
): VersionedCurriculumContext => {
  return {
    tenantId,
    standardId: pack.standardId,
    standardCode: pack.standardCode,
    grade: input.grade,
    language: input.language,
    packVersion: pack.packVersion,
    graphVersion: pack.graph.version,
    targetNodeId: pack.graph.targetNodeId,
    nodes: pack.graph.nodes,
    edges: pack.graph.edges,
    answerRules: pack.answerRules,
    allowedScreenPatterns: pack.allowedScreenPatterns,
    ...(pack.reference && { reference: pack.reference }),
  };
};

/**
 * Test and fixture helper: resolve the registered pack for the requested
 * standard and fail loudly when none exists. Production resolves through
 * `resolveCurriculumContext` and returns `undefined` instead.
 */
export const createSyntheticCurriculumContext = (
  input: Pick<NormalizedGenerationRequest, "grade" | "language" | "standardId">,
  tenantId: string = syntheticSeed.tenant.id
): VersionedCurriculumContext => {
  const pack = standardsPackRegistry.resolve({
    tenantId,
    standard: input.standardId,
  });
  if (!pack) {
    throw new Error(
      `No standards pack resolves standard ${input.standardId} for tenant ${tenantId}.`
    );
  }
  return createCurriculumContextFromPack(pack, input, tenantId);
};

export {
  type RecoveryAction,
  type SemanticValidationVerdict,
} from "@/shared/generation-contract";
