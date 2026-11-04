import {
  advisoryReviewReadResponseSchema,
  advisoryReviewRunResponseSchema,
} from "@/shared/generation-contract";

import { advisoryReviewTimeoutMs } from "./advisory-review-contract";
import {
  classifyAdvisoryReviewFailure,
  runBoundedAdvisoryReview,
} from "./advisory-review-runner";
import { resolveCurriculumContext } from "./draft-acceptance";
import { toNormalizedReasoningPath } from "./learning-path";
import {
  cloneSemanticValidationInput,
  sanitizedRecommendations,
} from "./semantic-validation-utilities";

import type {
  AdvisoryReview,
  AdvisoryReviewReadResponse,
  AdvisoryReviewRunResponse,
} from "@/shared/generation-contract";
import type { AdvisoryReviewAgent } from "./advisory-review-contract";
import type { AdvisoryReviewAgentRun } from "./advisory-review-runner";
import type { GenerationPersistence, LessonGenerationRecord } from "./types";
import type { TeacherActor } from "@/server/identity/types";
import type {
  NormalizedReasoningPath,
  SemanticValidationInput,
  VersionedCurriculumContext,
} from "./semantic-validation-contract";

/**
#223: the async advisory-review service.

It loads a stored `ready-for-review` record, resolves the pack-derived context,
runs the bounded reviewer, and appends warning-only findings to a separate
advisory field. It never changes the draft, the record state, the diagnostics,
the gate snapshot, or an answer key, and a failed review is never written.
*/

export type AdvisoryReviewErrorCode =
  | "ADVISORY_REVIEW_FORBIDDEN"
  | "ADVISORY_REVIEW_NOT_READY"
  | "ADVISORY_REVIEW_STALE";

const advisoryReviewErrorStatusByCode: Record<AdvisoryReviewErrorCode, number> =
  {
    ADVISORY_REVIEW_FORBIDDEN: 403,
    ADVISORY_REVIEW_NOT_READY: 409,
    ADVISORY_REVIEW_STALE: 409,
  };

/**
A typed advisory refusal. The delivery seam owns the transport response; this
module never builds HTTP.
*/
export class AdvisoryReviewError extends Error {
  readonly code: AdvisoryReviewErrorCode;
  readonly status: number;

  constructor(code: AdvisoryReviewErrorCode, message: string) {
    super(message);
    this.name = "AdvisoryReviewError";
    this.code = code;
    this.status = advisoryReviewErrorStatusByCode[code];
  }
}

const advisoryReviewError = (
  code: AdvisoryReviewErrorCode,
  message: string
): AdvisoryReviewError => new AdvisoryReviewError(code, message);

const forbiddenMessage = "You do not have access to this resource.";

export interface AdvisoryReviewServiceOptions {
  generation: GenerationPersistence;
  agent: AdvisoryReviewAgent;
  timeoutMs?: number;
  now?: () => string;
  /**
  Overridable for tests; production resolves the pack-derived context so the
  reviewer reads the same curriculum facts the gate did.
  */
  curriculumContext?: (
    input: LessonGenerationRecord["input"],
    tenantId: string
  ) => VersionedCurriculumContext | undefined;
}

export interface AdvisoryReviewService {
  /**
  Run the bounded reviewer for an owned, ready-for-review draft and store a
  warning-only result. A failure is reported and never written.
  */
  review: (
    actor: TeacherActor,
    requestId: string
  ) => Promise<AdvisoryReviewRunResponse>;
  /** Read the stored advisory result of an owned draft, if one exists. */
  read: (
    actor: TeacherActor,
    requestId: string
  ) => Promise<AdvisoryReviewReadResponse>;
}

const advisoryReviewInput = (
  record: LessonGenerationRecord,
  context: VersionedCurriculumContext
): SemanticValidationInput => {
  if (!record.draft) {
    throw advisoryReviewError(
      "ADVISORY_REVIEW_NOT_READY",
      "Only a matching lesson draft can receive an advisory review."
    );
  }

  const path: NormalizedReasoningPath = toNormalizedReasoningPath(
    record.draft.learningPath
  );
  return {
    draft: { variants: record.draft.variants },
    context,
    path,
  };
};

export const createAdvisoryReviewService = (
  options: AdvisoryReviewServiceOptions
): AdvisoryReviewService => {
  const { generation, agent } = options;
  const timeoutMs = Math.max(1, options.timeoutMs ?? advisoryReviewTimeoutMs);
  const clock = options.now ?? (() => new Date().toISOString());
  const resolveContext =
    options.curriculumContext ??
    ((input: LessonGenerationRecord["input"], tenantId: string) => {
      return resolveCurriculumContext(input, tenantId, {});
    });

  const loadOwned = async (
    actor: TeacherActor,
    requestId: string
  ): Promise<LessonGenerationRecord> => {
    const record = await generation.readGeneration(actor.tenantId, requestId);
    if (!record || record.teacherId !== actor.actorId) {
      // Never reveal whether another teacher's or tenant's draft exists.
      throw advisoryReviewError("ADVISORY_REVIEW_FORBIDDEN", forbiddenMessage);
    }
    return record;
  };

  const review = async (
    actor: TeacherActor,
    requestId: string
  ): Promise<AdvisoryReviewRunResponse> => {
    const record = await loadOwned(actor, requestId);
    if (record.state !== "ready-for-review") {
      throw advisoryReviewError(
        "ADVISORY_REVIEW_NOT_READY",
        "Only a ready-for-review draft can receive an advisory review."
      );
    }

    const context = resolveContext(record.input, record.tenantId);
    if (!context) {
      throw advisoryReviewError(
        "ADVISORY_REVIEW_NOT_READY",
        "The advisory review needs an approved standards pack for this draft."
      );
    }

    const input = cloneSemanticValidationInput(
      advisoryReviewInput(record, context)
    );
    let run: AdvisoryReviewAgentRun;
    try {
      run = await runBoundedAdvisoryReview(agent, input, timeoutMs);
    } catch (error) {
      // A slow or failed reviewer leaves the stored record untouched.
      return advisoryReviewRunResponseSchema.parse({
        status: "failed",
        failure: classifyAdvisoryReviewFailure(error),
      });
    }

    const advisory: AdvisoryReview = {
      schemaVersion: "advisory-review-v1",
      agent: {
        provider: agent.provider,
        model: agent.model,
        validatorVersion: agent.version,
      },
      reviewedAt: clock(),
      latencyMs: run.latencyMs,
      // Warning-only by construction: the stored finding has no verdict field.
      findings: sanitizedRecommendations(run.recommendations),
    };

    const stored = await generation.writeAdvisoryReview(
      record.tenantId,
      requestId,
      advisory
    );
    if (!stored) {
      throw advisoryReviewError(
        "ADVISORY_REVIEW_STALE",
        "The draft changed before the advisory review could be stored. Try again."
      );
    }

    return advisoryReviewRunResponseSchema.parse({
      status: "complete",
      review: advisory,
    });
  };

  const read = async (
    actor: TeacherActor,
    requestId: string
  ): Promise<AdvisoryReviewReadResponse> => {
    const record = await loadOwned(actor, requestId);
    return advisoryReviewReadResponseSchema.parse({
      review: record.advisoryReview ?? null,
    });
  };

  return { review, read };
};
