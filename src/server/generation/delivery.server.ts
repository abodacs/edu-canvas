import { z } from "zod";

import { lessonGenerationInputSchema } from "@/shared/generation-contract";

import {
  identityErrorJson,
  resolveProtectedTeacher,
  resolveTeacherActor,
} from "../identity/api.server";
import { IdentityError } from "../identity/errors";
import { readJsonBody, noStoreJson } from "../http.server";
import { readServerConfig } from "../config";
import {
  createFoundationPersistence,
  createGenerationLimitStore,
} from "../persistence";
import {
  AdvisoryReviewError,
  createAdvisoryReviewService,
} from "./advisory-review";
import {
  advisoryReviewTimeoutMs,
  advisoryReviewerVersion,
} from "./advisory-review-contract";
import { createMetaAdvisoryReviewAgent } from "./advisory-review-agent";
import { createConfiguredLessonDraftProvider } from "./factory";
import { GenerationRequestError } from "./generation-request-error";
import { createGenerationService } from "./service";

import type { AdvisoryReviewService } from "./advisory-review";

const createService = (): ReturnType<typeof createGenerationService> => {
  const config = readServerConfig();
  return createGenerationService({
    persistence: createFoundationPersistence(config),
    provider: createConfiguredLessonDraftProvider(config),
    limits: createGenerationLimitStore(config),
  });
};

/**
#223: the advisory reviewer is a separate composition. It uses the same
persistence port and the same Meta configuration, but it has its own bound and
never joins the generation request.
*/
const createAdvisoryReviewServiceFromConfig = (): AdvisoryReviewService => {
  const config = readServerConfig();
  if (!config.metaApiKey) {
    throw new Error("Meta provider configuration is incomplete.");
  }

  return createAdvisoryReviewService({
    generation: createFoundationPersistence(config),
    agent: createMetaAdvisoryReviewAgent({
      apiKey: config.metaApiKey,
      model: config.metaModel,
      version: advisoryReviewerVersion,
      baseUrl: config.metaBaseUrl,
      timeoutMs: advisoryReviewTimeoutMs,
    }),
  });
};

const resolveTeacher = resolveProtectedTeacher;

/**
Map a generation failure to its transport response. Typed domain errors carry their own code, curated message, and status from the shared seam contract; everything else keeps the generic fallback so no internal detail escapes.
*/
export const mapGenerationError = (error: unknown): Response => {
  if (error instanceof IdentityError) {
    return identityErrorJson(error);
  }
  if (error instanceof GenerationRequestError) {
    const retryAfterSeconds =
      error.retryAfterMs === undefined
        ? undefined
        : Math.max(1, Math.ceil(error.retryAfterMs / 1000));
    return noStoreJson(
      {
        code: error.code,
        message: error.message,
        ...(retryAfterSeconds !== undefined && { retryAfterSeconds }),
      },
      error.status,
      retryAfterSeconds === undefined
        ? {}
        : { "retry-after": String(retryAfterSeconds) }
    );
  }
  return noStoreJson(
    {
      code: "GENERATION_FAILED",
      message: "The draft could not be completed. Try again.",
    },
    500
  );
};

const draftIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,80}$/u);

/**
POST /api/lessons/generate — owning teacher, mutation-protected.
*/
export const handleGenerateLessonRequest = async (
  request: Request
): Promise<Response> => {
  const resolved = await resolveTeacher(request);
  if (!resolved.ok) {
    return resolved.response;
  }

  const parsed = lessonGenerationInputSchema.safeParse(
    await readJsonBody(request)
  );
  if (!parsed.success) {
    return identityErrorJson(new IdentityError("INVALID_INPUT"));
  }

  try {
    const result = await createService().generate({
      actor: resolved.actor,
      input: parsed.data,
    });
    return noStoreJson(result.publicResult);
  } catch (error) {
    return mapGenerationError(error);
  }
};

/**
POST /api/lessons/:draftId/cancel — owning teacher, mutation-protected.
*/
export const handleCancelGenerationRequest = async (
  request: Request,
  draftId: string
): Promise<Response> => {
  const resolved = await resolveTeacher(request);
  if (!resolved.ok) {
    return resolved.response;
  }

  const parsedDraftId = draftIdSchema.safeParse(draftId);
  if (!parsedDraftId.success) {
    return identityErrorJson(new IdentityError("INVALID_INPUT"));
  }

  try {
    const result = await createService().cancel({
      actor: resolved.actor,
      requestId: parsedDraftId.data,
    });
    return noStoreJson(result.publicResult);
  } catch (error) {
    return mapGenerationError(error);
  }
};

const advisoryUnavailableMessage =
  "The advisory review is temporarily unavailable. Try again later.";

/**
Map an advisory refusal or infrastructure failure to its transport response.
The reviewer is optional, so an unavailable provider is a 503, not a draft
failure.
*/
export const mapAdvisoryReviewError = (error: unknown): Response => {
  if (error instanceof IdentityError) {
    return identityErrorJson(error);
  }
  if (error instanceof AdvisoryReviewError) {
    return noStoreJson(
      { code: error.code, message: error.message },
      error.status
    );
  }
  return noStoreJson(
    {
      code: "ADVISORY_REVIEW_UNAVAILABLE",
      message: advisoryUnavailableMessage,
    },
    503
  );
};

/**
POST /api/lessons/:draftId/advisory-review — owning teacher, mutation-protected.
Runs the bounded reviewer after `ready-for-review` and appends warnings only.
*/
export const handleRequestAdvisoryReview = async (
  request: Request,
  draftId: string
): Promise<Response> => {
  const resolved = await resolveTeacher(request);
  if (!resolved.ok) {
    return resolved.response;
  }

  const parsedDraftId = draftIdSchema.safeParse(draftId);
  if (!parsedDraftId.success) {
    return identityErrorJson(new IdentityError("INVALID_INPUT"));
  }

  try {
    const result = await createAdvisoryReviewServiceFromConfig().review(
      resolved.actor,
      parsedDraftId.data
    );
    return noStoreJson(result, result.status === "failed" ? 503 : 200);
  } catch (error) {
    return mapAdvisoryReviewError(error);
  }
};

/**
GET /api/lessons/:draftId/advisory-review — owning teacher, read-only.
Returns the stored advisory result, or null when none was requested.
*/
export const handleReadAdvisoryReview = async (
  request: Request,
  draftId: string
): Promise<Response> => {
  const resolved = await resolveTeacherActor(request);
  if (!resolved.ok) {
    return noStoreJson(
      { code: resolved.error.code, message: resolved.error.message },
      resolved.error.status
    );
  }

  const parsedDraftId = draftIdSchema.safeParse(draftId);
  if (!parsedDraftId.success) {
    return identityErrorJson(new IdentityError("INVALID_INPUT"));
  }

  try {
    const result = await createAdvisoryReviewServiceFromConfig().read(
      resolved.actor,
      parsedDraftId.data
    );
    return noStoreJson(result);
  } catch (error) {
    return mapAdvisoryReviewError(error);
  }
};
