import type { AdvisoryReviewFailure } from "@/shared/generation-contract";

import type {
  SemanticAgentRecommendation,
  SemanticValidationInput,
} from "./semantic-validation-contract";

/**
#223: the contract for the async advisory reviewer.

The reviewer runs **after** a draft is `ready-for-review`, never inside
`validateSemanticLesson`. The inline runner clamps an agent to 5000 ms and turns
a timeout into `hard_block` `VALIDATION_TIMEOUT`, which would mark every
slow-but-fine draft `failed-retryable` (research record §7). The advisory
reviewer therefore owns its own, longer bound and a warning-only result.
*/

export const advisoryReviewerVersion = "advisory-reviewer-v1";

/**
The reviewer needs the whole generation budget's worth of time, not the inline
5000 ms clamp. One attempt only: a retry would double a teacher's wait and the
result is advisory, not required.
*/
export const advisoryReviewTimeoutMs = 60_000;

export type AdvisoryReviewFailureClass = AdvisoryReviewFailure["class"];

export interface AdvisoryReviewAgent {
  provider: string;
  model: string;
  version: string;
  /**
  The same `review` signature the inline `SemanticValidationAgent` uses, so the
  existing input clone and recommendation contract apply unchanged. The agent
  carries no semantic validator role: an advisory result must never be able to
  enter a semantic report, where a warning can become a block.
  */
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
  /** Overridable for tests; never used to bypass the bound in production. */
  fetchImplementation?: (input: string, init: RequestInit) => Promise<Response>;
}
