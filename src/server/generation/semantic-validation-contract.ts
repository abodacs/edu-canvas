import { demoSeed } from "@/server/seed-data";
import type { LessonLanguage } from "@/shared/generation-contract";

import type { NormalizedGenerationRequest } from "./provider";
import type { ProviderLessonDraft } from "./types";

export const curriculumValidatorVersion = "curriculum-validator-v1";
export const learningQualityValidatorVersion = "learning-quality-validator-v1";
export const semanticValidationRunnerVersion = "semantic-validation-runner-v1";

export type SemanticValidationVerdict = "pass" | "warning" | "block";
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
  graphVersion: string;
  targetNodeId: string;
  nodes: readonly CurriculumNode[];
  edges: readonly CurriculumEdge[];
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

export interface SemanticValidationFinding {
  validator: SemanticValidatorRole;
  validatorVersion: string;
  verdict: SemanticValidationVerdict;
  code: string;
  field: string;
  reason: string;
  variantId?: string;
  nodeId?: string;
  recommendation?: string;
}

export interface SemanticValidatorReview {
  validator: SemanticValidatorRole;
  validatorVersion: string;
  verdict: SemanticValidationVerdict;
  field: string;
  nodeId?: string;
  reason: string;
  findings: readonly SemanticValidationFinding[];
}

export interface SemanticValidationReport {
  status: SemanticValidationStatus;
  verdict: SemanticValidationVerdict;
  reviews: readonly SemanticValidatorReview[];
  findings: readonly SemanticValidationFinding[];
  retry: {
    available: boolean;
    message: string;
  };
}

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
 * The seeded curriculum is a stand-in, not a tenant-owned catalogue (#110 owns
 * that). Its context is therefore bound to the acting tenant so that a real
 * signed-in teacher is not rejected by the tenant-match check. Replace this
 * default with tenant-owned graph resolution when it lands.
 */
export const createDemoCurriculumContext = (
  input: Pick<NormalizedGenerationRequest, "grade" | "language" | "standardId">,
  tenantId: string = demoSeed.tenant.id
): VersionedCurriculumContext => {
  return {
    tenantId,
    standardId: input.standardId,
    standardCode: demoSeed.standard.code,
    grade: input.grade,
    language: input.language,
    graphVersion: demoSeed.activityVersion.graphVersion,
    targetNodeId: "graph_node_equivalent_fractions",
    nodes: demoSeed.graphNodes,
    edges: demoSeed.graphEdges,
  };
};
