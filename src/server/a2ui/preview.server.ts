import { z } from "zod";

import {
  A2UI_CATALOG_VERSION,
  FRACTIONS_CATALOG_VERSION,
  a2uiCatalogVersions,
} from "@/shared/a2ui-contract";
import { gateStoredArtifact } from "@/server/safety/artifact-enforcement";

import { resolveTeacherActor } from "../identity/api.server";
import { noStoreJson } from "../http.server";
import { compileLessonPreview, LessonPreviewCompileError } from "./compiler";
import { compileFractionPreview } from "./fraction-compiler";
import { createPreviewSSEStream } from "./stream";
import type { CompiledFractionPreview } from "./fraction-compiler";
import type { A2UICatalogVersion } from "@/shared/a2ui-contract";
import type { StoredArtifactGateRefusal } from "@/server/safety/artifact-enforcement";
import type { ArtifactPreRenderFailure } from "@/server/safety/artifact-gate";

import type { CompiledLessonPreview } from "./compiler";
import type { ServerConfig } from "../config";

const previewUnavailableMessage =
  "The preview is temporarily unavailable. Try again later.";
const previewBlockedMessage =
  "This draft could not be rendered safely. Try generating it again.";

const requestIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,80}$/u);

const sseError = (code: string, message: string, status: number) =>
  noStoreJson({ code, message }, status);

/**
 * The structured refusal shape: hard blocks name the verdict, findings, and recovery; an infrastructure or snapshot refusal stays retryable.
 */
const gateRefusal = (refusal: StoredArtifactGateRefusal): Response => {
  return noStoreJson(
    {
      code:
        refusal.code === "GATE_HARD_BLOCKED" ? "PREVIEW_BLOCKED" : refusal.code,
      message: refusal.message,
      ...(refusal.verdict && { verdict: refusal.verdict }),
      findings: refusal.findings,
      recovery: refusal.recovery,
    },
    422
  );
};

// `LessonPreviewCompileError` carries no code, so the preview seam owns the
// deterministic mapping into the gate's pre-render failure shape.
const compileFailureCode = (message: string): string => {
  if (message.includes("fraction draft does not match")) {
    return "FRACTION_CONTRACT_INVALID";
  }
  if (message.includes("four-variant lesson")) {
    return "INCOMPLETE_VARIANT_SET";
  }
  if (message.includes("duplicate variant identifiers")) {
    return "DUPLICATE_VARIANT_ID";
  }
  if (message.includes("grade is not supported")) {
    return "UNSUPPORTED_GRADE";
  }
  return message.includes("invalid ")
    ? "INVALID_COMPONENT_ID"
    : "PREVIEW_COMPILE_REJECTED";
};

const compileFailure = (
  error: LessonPreviewCompileError
): ArtifactPreRenderFailure => {
  return {
    code: compileFailureCode(error.message),
    field: "preview",
    reason: error.message,
  };
};

const streamPreview = (
  preview: CompiledLessonPreview | CompiledFractionPreview,
  signal: AbortSignal | null
): Response => {
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

const buildPreviewResponse = async ({
  config,
  requestId,
  tenantId,
  actorId,
  requestedCatalog,
  signal,
}: {
  config: ServerConfig;
  requestId: string;
  tenantId: string;
  actorId: string;
  requestedCatalog: A2UICatalogVersion;
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

  if (
    record.state !== "ready-for-review" ||
    (!record.draft && !record.fractionDraft)
  ) {
    return sseError(
      "PREVIEW_NOT_READY",
      "This draft is not ready for a teacher preview. Review its status and try again.",
      409
    );
  }

  // #116: the record's pinned catalog is the authority. Records without a
  // provenance pin are matching-v1; the request must ask for exactly what is
  // pinned so a surface never renders under a foreign catalog.
  const pinnedCatalog =
    record.provenance?.catalogVersion === FRACTIONS_CATALOG_VERSION
      ? FRACTIONS_CATALOG_VERSION
      : A2UI_CATALOG_VERSION;
  if (requestedCatalog !== pinnedCatalog) {
    return sseError(
      "UNSUPPORTED_CATALOG",
      `This preview is pinned to ${pinnedCatalog}.`,
      406
    );
  }

  // #28: never trust the stored verdict alone. Re-derive the gate from the
  // stored artifact and prove the acceptance snapshot still describes it.
  const gateOutcome = gateStoredArtifact(record);
  if (!gateOutcome.ok) {
    return gateRefusal(gateOutcome.refusal);
  }

  const compileGuarded = (compile: () => Response): Response => {
    try {
      return compile();
    } catch (error) {
      if (!(error instanceof LessonPreviewCompileError)) {
        throw error;
      }
      // The compile guard failed closed. Feed the deterministic rejection
      // back into the gate so the refusal carries findings and recovery.
      const blocked = gateStoredArtifact(record, {
        preRenderFailures: [compileFailure(error)],
      });
      return blocked.ok
        ? sseError("PREVIEW_UNAVAILABLE", previewUnavailableMessage, 503)
        : gateRefusal(blocked.refusal);
    }
  };

  if (pinnedCatalog === FRACTIONS_CATALOG_VERSION) {
    // Fail closed when a fraction-pinned record lacks a fraction draft; the
    // state gate above only proves a matching-shaped draft exists or not.
    const { fractionDraft } = record;
    return fractionDraft
      ? compileGuarded(() => {
          return streamPreview(
            compileFractionPreview({ draft: fractionDraft }),
            signal
          );
        })
      : sseError("PREVIEW_BLOCKED", previewBlockedMessage, 422);
  }

  const { draft } = record;
  if (!draft) {
    return sseError("PREVIEW_BLOCKED", previewBlockedMessage, 422);
  }

  return compileGuarded(() => {
    return streamPreview(
      compileLessonPreview({
        requestId: record.requestId,
        grade: record.input.grade,
        standardId: record.input.standardId,
        language: record.input.language,
        draft,
        learningPath: draft.learningPath,
      }),
      signal
    );
  });
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

  const requestedCatalog =
    url.searchParams.get("catalogVersion") ?? A2UI_CATALOG_VERSION;
  if (!a2uiCatalogVersions.includes(requestedCatalog as A2UICatalogVersion)) {
    return sseError(
      "UNSUPPORTED_CATALOG",
      "This preview catalog version is not supported.",
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
      requestedCatalog: requestedCatalog as A2UICatalogVersion,
      signal: request.signal,
    });
  } catch (error) {
    return error instanceof LessonPreviewCompileError
      ? sseError("PREVIEW_BLOCKED", previewBlockedMessage, 422)
      : sseError("PREVIEW_UNAVAILABLE", previewUnavailableMessage, 503);
  }
};
