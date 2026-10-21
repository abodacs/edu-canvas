import { setTimeout as delay } from "node:timers/promises";

import { reviewCurriculum } from "./curriculum-validator";
import { reviewLearningQuality } from "./learning-quality-validator";
import {
  createReview,
  finding,
  reviewVerdict,
} from "./semantic-validation-utilities";
import type {
  SemanticAgentRecommendation,
  SemanticValidationAgent,
  SemanticValidationFinding,
  SemanticValidationInput,
  SemanticValidationOptions,
  SemanticValidationReport,
  SemanticValidationStatus,
  SemanticValidatorReview,
} from "./semantic-validation-contract";

export {
  createDemoCurriculumContext,
  curriculumValidatorVersion,
  learningQualityValidatorVersion,
  semanticValidationRunnerVersion,
} from "./semantic-validation-contract";
export type {
  CurriculumEdge,
  CurriculumNode,
  NormalizedReasoningPath,
  SemanticAgentRecommendation,
  SemanticValidationAgent,
  SemanticValidationFinding,
  SemanticValidationInput,
  SemanticValidationOptions,
  SemanticValidationReport,
  SemanticValidationStatus,
  SemanticValidationVerdict,
  SemanticValidatorReview,
  SemanticValidatorRole,
  VersionedCurriculumContext,
} from "./semantic-validation-contract";

class SemanticValidationTimeoutError extends Error {
  constructor() {
    super("Semantic validation timed out.");
    this.name = "SemanticValidationTimeoutError";
  }
}

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  const controller = new AbortController();
  const timeout = (async (): Promise<never> => {
    await delay(timeoutMs, undefined, { signal: controller.signal });
    throw new SemanticValidationTimeoutError();
  })();

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    controller.abort();
  }
};

const unsafeAgentTextPatterns = [
  /answer\s*key/iu,
  /api\s*key/iu,
  /secret/iu,
  /student/iu,
  /chain[- ]of[- ]thought/iu,
  /\d{1,9}\s{0,3}\/\s{0,3}\d{1,9}/iu,
];

const hasUnsafeAgentText = (value: string): boolean =>
  unsafeAgentTextPatterns.some((pattern) => pattern.test(value));

const safeAgentText = (value: string, fallback: string): string => {
  const text = value.trim().replaceAll(/\s+/gu, " ");
  return !text || text.length > 240 || hasUnsafeAgentText(text)
    ? fallback
    : text;
};

const isUnsafeIdentifier = (value: string): boolean => {
  return (
    value.length > 80 ||
    !/^[a-z][a-z0-9_.:-]*$/iu.test(value) ||
    /student|learner|identity|user/iu.test(value)
  );
};

const safeIdentifier = (value: string | undefined): string | undefined =>
  value && !isUnsafeIdentifier(value) ? value : undefined;

const cloneSemanticValidationInput = (
  input: SemanticValidationInput
): SemanticValidationInput => ({
  draft: {
    variants: input.draft.variants.map((variant) => ({
      ...variant,
      sourceItems: variant.sourceItems.map((item) => ({ ...item })),
      targetItems: variant.targetItems.map((item) => ({ ...item })),
      distractorItems: variant.distractorItems.map((item) => ({ ...item })),
      // Advisory agents review learning quality, not private answer keys.
      relationships: [],
      hints: [...variant.hints],
      feedback: { ...variant.feedback },
      languageMetadata: { ...variant.languageMetadata },
      accessibilityMetadata: { ...variant.accessibilityMetadata },
    })),
  },
  context: {
    ...input.context,
    nodes: input.context.nodes.map((node) => ({ ...node })),
    edges: input.context.edges.map((edge) => ({ ...edge })),
  },
  ...(input.path && {
    path: {
      ...input.path,
      nodeIds: [...input.path.nodeIds],
      ...(input.path.screenPurposeIds && {
        screenPurposeIds: [...input.path.screenPurposeIds],
      }),
    },
  }),
});

const recommendationFindings = (
  agent: SemanticValidationAgent,
  recommendations: readonly SemanticAgentRecommendation[]
): SemanticValidationFinding[] => {
  return recommendations
    .filter((recommendation) => recommendation.verdict !== "pass")
    .map((recommendation) => {
      const variantId = safeIdentifier(recommendation.variantId);
      const nodeId = safeIdentifier(recommendation.nodeId);
      return finding(agent.role, agent.version, {
        verdict: "warning",
        code: "AGENT_RECOMMENDATION",
        field: safeAgentText(recommendation.field ?? "draft", "draft"),
        ...(variantId && { variantId }),
        ...(nodeId && { nodeId }),
        reason: safeAgentText(
          recommendation.reason,
          "A validator recommendation needs teacher review."
        ),
        ...(recommendation.recommendation && {
          recommendation: safeAgentText(
            recommendation.recommendation,
            "Review this recommendation before continuing."
          ),
        }),
      });
    });
};

const runRecommendationAgent = async (
  agent: SemanticValidationAgent,
  input: SemanticValidationInput,
  options: Required<
    Pick<
      SemanticValidationOptions,
      "timeoutMs" | "maxAttempts" | "retryDelayMs"
    >
  >
): Promise<readonly SemanticAgentRecommendation[]> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    try {
      // Retries are sequential by design: each attempt must settle before the
      // next one starts, and the previous attempt is aborted first.
      // eslint-disable-next-line no-await-in-loop
      return await withTimeout(
        agent.review(cloneSemanticValidationInput(input), controller.signal),
        options.timeoutMs
      );
    } catch (error) {
      lastError = error;
      if (attempt < options.maxAttempts && options.retryDelayMs > 0) {
        // Back off before the next sequential attempt.
        // eslint-disable-next-line no-await-in-loop
        await delay(options.retryDelayMs);
      }
    } finally {
      controller.abort();
    }
  }
  throw Error.isError(lastError)
    ? lastError
    : new Error("Semantic validation agent failed.");
};

const failedAgentReview = (
  agent: SemanticValidationAgent,
  error: unknown
): SemanticValidatorReview => {
  const isTimedOut = error instanceof SemanticValidationTimeoutError;
  const findingCode = isTimedOut
    ? "VALIDATION_TIMEOUT"
    : "VALIDATION_RETRY_EXHAUSTED";
  const reason = isTimedOut
    ? "The semantic validator timed out before completing. Try this draft again."
    : "The semantic validator could not complete after a bounded retry. Try this draft again.";
  const findingValue = finding(agent.role, agent.version, {
    verdict: "block",
    code: findingCode,
    field: "validation",
    reason,
    recommendation:
      "Retry the draft so the server can repeat the bounded validation.",
  });
  return {
    ...createReview(agent.role, agent.version, [findingValue]),
    reason,
  };
};

const combineReviews = (
  reviews: readonly SemanticValidatorReview[],
  status: SemanticValidationStatus = "complete"
): SemanticValidationReport => {
  const findings = reviews.flatMap((review) => review.findings);
  return {
    status,
    verdict: reviewVerdict(findings),
    reviews,
    findings,
    retry: {
      available: status === "retryable",
      message:
        status === "retryable"
          ? "Validation did not finish safely. Try this draft again."
          : "This validation result does not need a retry.",
    },
  };
};

const boundedAgentOptions = (options: SemanticValidationOptions) => {
  return {
    timeoutMs: Math.max(1, Math.min(options.timeoutMs ?? 250, 5000)),
    maxAttempts: Math.max(1, Math.min(options.maxAttempts ?? 2, 2)),
    retryDelayMs: Math.max(0, Math.min(options.retryDelayMs ?? 0, 1000)),
  };
};

export const validateSemanticLesson = async (
  input: SemanticValidationInput,
  options: SemanticValidationOptions = {}
): Promise<SemanticValidationReport> => {
  const reviews: SemanticValidatorReview[] = [
    reviewCurriculum(input),
    reviewLearningQuality(input),
  ];
  const agentOptions = boundedAgentOptions(options);
  let status: SemanticValidationStatus = "complete";

  const recommendationResults = await Promise.all(
    (options.recommendationAgents ?? []).map(async (agent) => {
      try {
        const recommendations = await runRecommendationAgent(
          agent,
          input,
          agentOptions
        );
        const findings = recommendationFindings(agent, recommendations);
        const review = createReview(agent.role, agent.version, findings);
        return {
          review: {
            ...review,
            reason: "The validator provided an advisory recommendation.",
          } satisfies SemanticValidatorReview,
        };
      } catch (error) {
        status = "retryable";
        return { review: failedAgentReview(agent, error) };
      }
    })
  );

  reviews.push(...recommendationResults.map((result) => result.review));
  return combineReviews(reviews, status);
};
