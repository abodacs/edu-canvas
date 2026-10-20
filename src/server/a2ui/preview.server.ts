import { z } from "zod";

import { A2UI_CATALOG_ID, A2UI_CATALOG_VERSION } from "@/shared/a2ui-contract";
import { isDemoRole } from "@/shared/demo-contract";

import { readServerConfig } from "../config";
import { createFoundationPersistence } from "../persistence";
import { assertTenantAccess, getDemoSession } from "../demo/policy";
import { compileLessonPreview, LessonPreviewCompileError } from "./compiler";
import { createPreviewSSEStream } from "./stream";

const requestIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,80}$/u);

const jsonResponse = (payload: unknown, status = 200) => {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
};

const sseError = (code: string, message: string, status: number) =>
  jsonResponse({ code, message }, status);

const buildPreviewResponse = async ({
  config,
  session,
  requestId,
  signal,
}: {
  config: ReturnType<typeof readServerConfig>;
  session: ReturnType<typeof getDemoSession>;
  requestId: string;
  signal: AbortSignal | null;
}): Promise<Response> => {
  const record = await createFoundationPersistence(config).readGeneration(
    session.tenantId,
    requestId
  );

  if (!record || record.teacherId !== session.identityId) {
    return sseError(
      "PREVIEW_NOT_FOUND",
      "That lesson draft is no longer available. Generate it again.",
      404
    );
  }

  assertTenantAccess(session, record.tenantId);

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
  const role = url.searchParams.get("role");
  if (!role || !isDemoRole(role)) {
    return sseError("INVALID_ROLE", "This preview role is not available.", 400);
  }

  const requestId = url.searchParams.get("requestId");
  const parsedRequestId = requestIdSchema.safeParse(requestId);
  if (!parsedRequestId.success) {
    return sseError(
      "INVALID_REQUEST_ID",
      "This preview request is not valid. Generate the draft again.",
      400
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

  const config = readServerConfig();
  if (config.issues.length > 0) {
    return sseError(
      "PREVIEW_UNAVAILABLE",
      "The preview is temporarily unavailable. Try again later.",
      503
    );
  }

  const session = getDemoSession(role);
  if (session.role !== "teacher") {
    return sseError(
      "PREVIEW_FORBIDDEN",
      "Only the seeded teacher can open lesson previews.",
      403
    );
  }

  try {
    return await buildPreviewResponse({
      config,
      session,
      requestId: parsedRequestId.data,
      signal: request.signal,
    });
  } catch (error) {
    return error instanceof LessonPreviewCompileError
      ? sseError(
          "PREVIEW_BLOCKED",
          "This draft could not be rendered safely. Try generating it again.",
          422
        )
      : sseError(
          "PREVIEW_UNAVAILABLE",
          "The preview is temporarily unavailable. Try again later.",
          503
        );
  }
};
