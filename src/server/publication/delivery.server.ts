import { z } from "zod";

import { publicationOpenInputSchema } from "@/shared/publication-contract";
import { createPreviewSSEStream } from "@/server/a2ui/stream";
import { readServerConfig } from "@/server/config";
import { readJsonBody, noStoreJson } from "@/server/http.server";
import {
  identityErrorJson,
  resolveProtectedTeacher,
  resolveTeacherActor,
} from "@/server/identity/api.server";
import { IdentityError } from "@/server/identity/errors";
import {
  createFoundationPersistence,
  createPackPersistence,
} from "@/server/persistence";
import { PublicationError } from "./errors";
import { createPublicationService } from "./service";

import type { PublicationService } from "./service";

const idSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,80}$/u);

const createService = (): PublicationService => {
  const config = readServerConfig();
  return createPublicationService({
    generation: createFoundationPersistence(config),
    packs: createPackPersistence(config),
  });
};

const unavailableMessage =
  "The review is temporarily unavailable. Try again later.";

export const mapPublicationError = (error: unknown): Response => {
  if (error instanceof IdentityError) {
    return identityErrorJson(error);
  }
  if (error instanceof PublicationError) {
    return noStoreJson(
      {
        code: error.code,
        message: error.message,
        ...(error.findings.length > 0 && { findings: error.findings }),
        ...(error.detail && { detail: error.detail }),
      },
      error.status
    );
  }
  return noStoreJson(
    { code: "PUBLICATION_UNAVAILABLE", message: unavailableMessage },
    503
  );
};

const invalidInput = (): Response => {
  return noStoreJson(
    {
      code: "PUBLICATION_INPUT_INVALID",
      message: "The review request is not valid.",
    },
    422
  );
};

/**
POST /api/publications/review — open or resume the review of a ready draft.
*/
export const handleOpenReviewRequest = async (
  request: Request
): Promise<Response> => {
  const resolved = await resolveProtectedTeacher(request);
  if (!resolved.ok) {
    return resolved.response;
  }

  const parsed = publicationOpenInputSchema.safeParse(
    await readJsonBody(request)
  );
  if (!parsed.success) {
    return invalidInput();
  }

  try {
    const review = await createService().openReview(
      resolved.actor,
      parsed.data.requestId
    );
    return noStoreJson(review);
  } catch (error) {
    return mapPublicationError(error);
  }
};

/**
GET /api/publications/review?requestId=… — read the persisted review state.
*/
export const handleReadReviewRequest = async (
  request: Request
): Promise<Response> => {
  const resolved = await resolveTeacherActor(request);
  if (!resolved.ok) {
    return noStoreJson(
      { code: resolved.error.code, message: resolved.error.message },
      resolved.error.status
    );
  }

  const url = new URL(request.url);
  const requestId = url.searchParams.get("requestId");
  const parsed = idSchema.safeParse(requestId);
  if (!parsed.success) {
    return invalidInput();
  }

  try {
    const review = await createService().readReview(
      resolved.actor,
      parsed.data
    );
    return noStoreJson(review);
  } catch (error) {
    return mapPublicationError(error);
  }
};

/**
POST /api/publications/approvals — approve one screen or the reverse path.
*/
export const handleApproveRequest = async (
  request: Request
): Promise<Response> => {
  const resolved = await resolveProtectedTeacher(request);
  if (!resolved.ok) {
    return resolved.response;
  }

  try {
    const review = await createService().approve(
      resolved.actor,
      await readJsonBody(request)
    );
    return noStoreJson(review);
  } catch (error) {
    return mapPublicationError(error);
  }
};

/**
POST /api/publications/revisions — edit a screen and create a new revision.
*/
export const handleReviseRequest = async (
  request: Request
): Promise<Response> => {
  const resolved = await resolveProtectedTeacher(request);
  if (!resolved.ok) {
    return resolved.response;
  }

  try {
    const review = await createService().revise(
      resolved.actor,
      await readJsonBody(request)
    );
    return noStoreJson(review);
  } catch (error) {
    return mapPublicationError(error);
  }
};

/**
POST /api/publications — the explicit publish confirmation.
*/
export const handlePublishRequest = async (
  request: Request
): Promise<Response> => {
  const resolved = await resolveProtectedTeacher(request);
  if (!resolved.ok) {
    return resolved.response;
  }

  try {
    const outcome = await createService().publish(
      resolved.actor,
      await readJsonBody(request)
    );
    return noStoreJson(
      {
        publicationId: outcome.publicationId,
        assignmentId: outcome.assignmentId,
        review: outcome.review,
      },
      201
    );
  } catch (error) {
    return mapPublicationError(error);
  }
};

/**
GET /api/publications/versions/:versionId/preview — SSE render of an edited revision. The gate is re-derived before anything is compiled.
*/
const renderReviewPreview = async (
  actor: Parameters<PublicationService["compileVersionPreview"]>[0],
  versionId: string,
  signal: AbortSignal | null
): Promise<Response> => {
  const preview = await createService().compileVersionPreview(actor, versionId);
  return new Response(
    createPreviewSSEStream(preview.messages, signal ?? undefined),
    {
      headers: {
        "cache-control": "no-store, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        "x-edu-canvas-catalog": preview.catalogVersion,
      },
    }
  );
};

export const handleReviewPreviewRequest = async (
  request: Request,
  versionId: string
): Promise<Response> => {
  const resolved = await resolveTeacherActor(request);
  if (!resolved.ok) {
    return noStoreJson(
      { code: resolved.error.code, message: resolved.error.message },
      resolved.error.status
    );
  }

  const parsed = idSchema.safeParse(versionId);
  if (!parsed.success) {
    return invalidInput();
  }

  try {
    return await renderReviewPreview(
      resolved.actor,
      parsed.data,
      request.signal
    );
  } catch (error) {
    return mapPublicationError(error);
  }
};
