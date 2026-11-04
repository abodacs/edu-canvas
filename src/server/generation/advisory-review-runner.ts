import { setTimeout as delay } from "node:timers/promises";

import type { AdvisoryReviewFailure } from "@/shared/generation-contract";
import type { AdvisoryReviewAgent } from "./advisory-review-contract";
import type {
  SemanticAgentRecommendation,
  SemanticValidationInput,
} from "./semantic-validation-contract";

class AdvisoryReviewTimeoutError extends Error {
  constructor() {
    super("The advisory reviewer timed out.");
    this.name = "AdvisoryReviewTimeoutError";
  }
}

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  const controller = new AbortController();
  const timeout = (async (): Promise<never> => {
    await delay(timeoutMs, undefined, { signal: controller.signal });
    throw new AdvisoryReviewTimeoutError();
  })();

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    controller.abort();
  }
};

export interface AdvisoryReviewAgentRun {
  recommendations: readonly SemanticAgentRecommendation[];
  latencyMs: number;
}

/**
One bound owns both the provider call and the wait, so the aborted signal and
the timeout always agree about when the review is over. Exported so the measured
run uses the production bound instead of a second copy of it.
*/
export const runBoundedAdvisoryReview = async (
  agent: AdvisoryReviewAgent,
  input: SemanticValidationInput,
  timeoutMs: number
): Promise<AdvisoryReviewAgentRun> => {
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(timeoutMs),
  ]);
  const startedAt = Date.now();
  try {
    const recommendations = await withTimeout(
      agent.review(input, signal),
      timeoutMs
    );
    return { recommendations, latencyMs: Math.max(0, Date.now() - startedAt) };
  } finally {
    controller.abort();
  }
};

const failureMessage = (
  failureClass: AdvisoryReviewFailure["class"]
): string => {
  return failureClass === "timeout"
    ? "The advisory review timed out. The draft is unchanged."
    : "The advisory review could not complete. The draft is unchanged.";
};

/**
The single failure classification for the service and the measured run, so a
report never labels the same failure two ways.
*/
export const classifyAdvisoryReviewFailure = (
  error: unknown
): AdvisoryReviewFailure => {
  const failureClass: AdvisoryReviewFailure["class"] =
    error instanceof AdvisoryReviewTimeoutError ? "timeout" : "agent-failure";
  return { class: failureClass, message: failureMessage(failureClass) };
};
