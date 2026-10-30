import { z } from "zod";

import { A2UI_CATALOG_ID, A2UI_CATALOG_VERSION } from "@/shared/a2ui-contract";

import { resolveTeacherActor } from "../identity/api.server";
import { noStoreJson } from "../http.server";
import { compileLessonPreview, LessonPreviewCompileError } from "./compiler";
import { createPreviewSSEStream } from "./stream";

import type { ServerConfig } from "../config";

const previewUnavailableMessage =
  "The preview is temporarily unavailable. Try again later.";

const requestIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,80}$/u);

const sseError = (code: string, message: string, status: number) =>
  noStoreJson({ code, message }, status);

const buildPreviewResponse = async ({
  config,
  requestId,
  tenantId,
  actorId,
  signal,
}: {
  config: ServerConfig;
  requestId: string;
  tenantId: string;
  actorId: string;
  signal: AbortSignal | null;
}): Promise<Response> => {
  /* eslint-disable unicorn/single-line-block-comment-style -- Vite reads a dynamic import's chunkname only from a single-line block comment. */
  const { createFoundationPersistence } = await import(
    /* webpackChunkName: "foundation-persistence" */
    "../persistence"
  );
  /* eslint-enable unicorn/single-line-block-comment-style */
  const record = await createFoundationPersistence(config).readGeneration(
    tenantId,
    requestId
  );

  if (!record || record.teacherId !== actorId) {
    return sseError(
      "FORBIDDEN",
      "You do not have access to this resource.",
      403
    );
  }

  if (record.state !== "ready-for-review" || !record.draft) {
    return sseError(
      "PREVIEW_NOT_READY",
      "This draft is not ready for a teacher preview. Review its status and try again.",
      409
    );
  }

  const preview = compileLessonPreview({
    requestId: record.requestId,
    grade: record.input.grade,
    standardId: record.input.standardId,
    language: record.input.language,
    draft: record.draft,
    learningPath: record.draft.learningPath,
  });

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

export const handleLessonPreviewRequest = async (
  request: Request
): Promise<Response> => {
  const url = new URL(request.url);

  const requestId = url.searchParams.get("requestId");
  const parsedRequestId = requestIdSchema.safeParse(requestId);
  if (!parsedRequestId.success) {
    return sseError(
      "INVALID_REQUEST_ID",
      "This preview request is not valid. Generate the draft again.",
      422
    );
  }

  const catalogVersion =
    url.searchParams.get("catalogVersion") ?? A2UI_CATALOG_VERSION;
  if (catalogVersion !== A2UI_CATALOG_VERSION) {
    return sseError(
      "UNSUPPORTED_CATALOG",
      `This browser supports ${A2UI_CATALOG_ID} only.`,
      406
    );
  }

  const resolved = await resolveTeacherActor(request);
  if (!resolved.ok) {
    return sseError(
      resolved.error.code,
      resolved.error.message,
      resolved.error.status
    );
  }

  try {
    return await buildPreviewResponse({
      config: resolved.dependencies.config,
      requestId: parsedRequestId.data,
      tenantId: resolved.actor.tenantId,
      actorId: resolved.actor.actorId,
      signal: request.signal,
    });
  } catch (error) {
    return error instanceof LessonPreviewCompileError
      ? sseError(
          "PREVIEW_BLOCKED",
          "This draft could not be rendered safely. Try generating it again.",
          422
        )
      : sseError("PREVIEW_UNAVAILABLE", previewUnavailableMessage, 503);
  }
};
