import type { AdvisoryReviewFailure } from "@/shared/generation-contract";

import type {
  SemanticAgentRecommendation,
  SemanticValidationInput,
} from "./semantic-validation-contract";

export const advisoryReviewerVersion = "advisory-reviewer-v1";

export const advisoryReviewTimeoutMs = 60_000;

export type AdvisoryReviewFailureClass = AdvisoryReviewFailure["class"];

export interface AdvisoryReviewAgent {
  provider: string;
  model: string;
  version: string;
  review: (
    input: SemanticValidationInput,
    signal: AbortSignal
  ) => Promise<readonly SemanticAgentRecommendation[]>;
}

export interface AdvisoryReviewAgentOptions {
  apiKey: string;
  model: string;
  version: string;
  baseUrl?: string;
  timeoutMs: number;
  fetchImplementation?: (input: string, init: RequestInit) => Promise<Response>;
}
