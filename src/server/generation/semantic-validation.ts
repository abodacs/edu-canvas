import { reviewCurriculum } from './curriculum-validator'
import { reviewLearningQuality } from './learning-quality-validator'
import type {
  SemanticAgentRecommendation,
  SemanticValidationAgent,
  SemanticValidationFinding,
  SemanticValidationInput,
  SemanticValidationOptions,
  SemanticValidationReport,
  SemanticValidationStatus,
  SemanticValidatorReview,
} from './semantic-validation-contract'
import {
  createReview,
  finding,
  reviewVerdict,
} from './semantic-validation-utils'

export * from './semantic-validation-contract'

class SemanticValidationTimeout extends Error {
  constructor() {
    super('Semantic validation timed out.')
    this.name = 'SemanticValidationTimeout'
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new SemanticValidationTimeout()),
      timeoutMs,
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function safeAgentText(value: string, fallback: string): string {
  const text = value.trim().replaceAll(/\s+/g, ' ')
  if (
    !text ||
    text.length > 240 ||
    /answer\s*key|api\s*key|secret|student|chain[- ]of[- ]thought|\d+\s*\/\s*\d+/i.test(
      text,
    )
  ) {
    return fallback
  }
  return text
}

function safeIdentifier(value: string | undefined): string | undefined {
  if (
    !value ||
    value.length > 80 ||
    !/^[a-z][a-z0-9_.:-]*$/i.test(value) ||
    /student|learner|identity|user/i.test(value)
  ) {
    return undefined
  }
  return value
}

function cloneSemanticValidationInput(
  input: SemanticValidationInput,
): SemanticValidationInput {
  return {
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
    ...(input.path
      ? { path: { ...input.path, nodeIds: [...input.path.nodeIds] } }
      : {}),
  }
}

function recommendationFindings(
  agent: SemanticValidationAgent,
  recommendations: readonly SemanticAgentRecommendation[],
): SemanticValidationFinding[] {
  return recommendations
    .filter((recommendation) => recommendation.verdict !== 'pass')
    .map((recommendation) => {
      const variantId = safeIdentifier(recommendation.variantId)
      const nodeId = safeIdentifier(recommendation.nodeId)
      return finding(agent.role, agent.version, {
        verdict: 'warning',
        code: 'AGENT_RECOMMENDATION',
        field: safeAgentText(recommendation.field ?? 'draft', 'draft'),
        ...(variantId ? { variantId } : {}),
        ...(nodeId ? { nodeId } : {}),
        reason: safeAgentText(
          recommendation.reason,
          'A validator recommendation needs teacher review.',
        ),
        ...(recommendation.recommendation
          ? {
              recommendation: safeAgentText(
                recommendation.recommendation,
                'Review this recommendation before continuing.',
              ),
            }
          : {}),
      })
    })
}

async function runRecommendationAgent(
  agent: SemanticValidationAgent,
  input: SemanticValidationInput,
  options: Required<
    Pick<
      SemanticValidationOptions,
      'timeoutMs' | 'maxAttempts' | 'retryDelayMs'
    >
  >,
): Promise<readonly SemanticAgentRecommendation[]> {
  let lastError: unknown
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const controller = new AbortController()
    try {
      return await withTimeout(
        agent.review(cloneSemanticValidationInput(input), controller.signal),
        options.timeoutMs,
      )
    } catch (error) {
      lastError = error
      if (attempt < options.maxAttempts && options.retryDelayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, options.retryDelayMs),
        )
      }
    } finally {
      controller.abort()
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Semantic validation agent failed.')
}

function failedAgentReview(
  agent: SemanticValidationAgent,
  error: unknown,
): SemanticValidatorReview {
  const timedOut = error instanceof SemanticValidationTimeout
  const findingCode = timedOut
    ? 'VALIDATION_TIMEOUT'
    : 'VALIDATION_RETRY_EXHAUSTED'
  const reason = timedOut
    ? 'The semantic validator timed out before completing. Try this draft again.'
    : 'The semantic validator could not complete after a bounded retry. Try this draft again.'
  const findingValue = finding(agent.role, agent.version, {
    verdict: 'block',
    code: findingCode,
    field: 'validation',
    reason,
    recommendation:
      'Retry the draft so the server can repeat the bounded validation.',
  })
  return {
    ...createReview(agent.role, agent.version, [findingValue]),
    reason,
  }
}

function combineReviews(
  reviews: readonly SemanticValidatorReview[],
  status: SemanticValidationStatus = 'complete',
): SemanticValidationReport {
  const findings = reviews.flatMap((review) => review.findings)
  return {
    status,
    verdict: reviewVerdict(findings),
    reviews,
    findings,
    retry: {
      available: status === 'retryable',
      message:
        status === 'retryable'
          ? 'Validation did not finish safely. Try this draft again.'
          : 'This validation result does not need a retry.',
    },
  }
}

function boundedAgentOptions(options: SemanticValidationOptions) {
  return {
    timeoutMs: Math.max(1, Math.min(options.timeoutMs ?? 250, 5_000)),
    maxAttempts: Math.max(1, Math.min(options.maxAttempts ?? 2, 2)),
    retryDelayMs: Math.max(0, Math.min(options.retryDelayMs ?? 0, 1_000)),
  }
}

export async function validateSemanticLesson(
  input: SemanticValidationInput,
  options: SemanticValidationOptions = {},
): Promise<SemanticValidationReport> {
  const reviews: SemanticValidatorReview[] = [
    reviewCurriculum(input),
    reviewLearningQuality(input),
  ]
  const agentOptions = boundedAgentOptions(options)
  let status: SemanticValidationStatus = 'complete'

  const recommendationResults = await Promise.all(
    (options.recommendationAgents ?? []).map(async (agent) => {
      try {
        const recommendations = await runRecommendationAgent(
          agent,
          input,
          agentOptions,
        )
        const findings = recommendationFindings(agent, recommendations)
        const review = createReview(agent.role, agent.version, findings)
        return {
          review: {
            ...review,
            reason: 'The validator provided an advisory recommendation.',
          } satisfies SemanticValidatorReview,
        }
      } catch (error) {
        status = 'retryable'
        return { review: failedAgentReview(agent, error) }
      }
    }),
  )

  reviews.push(...recommendationResults.map((result) => result.review))
  return combineReviews(reviews, status)
}
