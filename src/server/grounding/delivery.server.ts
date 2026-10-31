import { z } from "zod";

import {
  correctedSourceTextSchema,
  sourceReviewInputSchema,
} from "@/shared/source-contract";

import { readServerConfig } from "../config";
import { resolveCurriculumContext } from "../generation/draft-acceptance";
import {
  identityErrorJson,
  resolveProtectedTeacher,
} from "../identity/api.server";
import { IdentityError } from "../identity/errors";
import { noStoreJson, readJsonBody } from "../http.server";
import { createFoundationPersistence } from "../persistence";
import { createDefaultContentSafety } from "../moderation/content-safety";
import { createSourceService } from "./source-service";
import { SourceRequestError } from "./types";

import type { PublicSourceSnapshot } from "@/shared/source-contract";
import type { TeacherActor } from "../identity/types";

/**
Server delivery seam for bounded source snapshots (#114). Every handler
resolves a verified teacher actor and the mutation guard before any domain
work; the cleanup sweep starts lazily with this module's first request.
*/

const createService = (): ReturnType<typeof createSourceService> => {
  const config = readServerConfig();
  return createSourceService({
    persistence: createFoundationPersistence(config),
    safety: createDefaultContentSafety(),
    resolveStandardPack: (standardId, tenantId) => {
      return (
        resolveCurriculumContext(
          {
            prompt: "",
            grade: 4,
            standardId,
            language: "en",
            difficulty: "on-level",
          },
          tenantId,
          {}
        ) !== undefined
      );
    },
  });
};

const SOURCE_CLEANUP_INTERVAL_MS = 3_600_000;

const cleanupState = { scheduled: false };

const runSourceCleanupSweep = async (): Promise<void> => {
  const clock = new Date();
  try {
    await createService().runCleanup(clock.toISOString());
  } catch {
    // The next hourly sweep retries; there is nothing actionable inside a
    // cleanup tick.
  }
};

const ensureSourceCleanup = (): void => {
  if (cleanupState.scheduled) {
    return;
  }
  cleanupState.scheduled = true;
  void runSourceCleanupSweep();
  const timer = setInterval(() => {
    void runSourceCleanupSweep();
  }, SOURCE_CLEANUP_INTERVAL_MS);
  timer.unref();
};

export const mapSourceError = (error: unknown): Response => {
  if (error instanceof IdentityError) {
    return identityErrorJson(error);
  }
  if (error instanceof SourceRequestError) {
    return noStoreJson(
      { code: error.code, message: error.message },
      error.status
    );
  }
  return noStoreJson(
    {
      code: "SOURCE_FAILED",
      message: "The source could not be processed. Try again.",
    },
    500
  );
};

const snapshotIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,80}$/u);

const formText = (value: FormDataEntryValue | null): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

type UploadParts =
  | {
      readonly kind: "file";
      readonly fileName: string;
      readonly bytes: Uint8Array;
      readonly syntheticMaterialConfirmed: boolean;
      readonly replacesSnapshotId?: string;
    }
  | {
      readonly kind: "text";
      readonly correctedText: string;
      readonly replacesSnapshotId?: string;
    };

const parseUploadParts = async (request: Request): Promise<UploadParts> => {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("source");
    if (!(file instanceof File) || file.size === 0 || file.name.length === 0) {
      throw new SourceRequestError("Choose a file to upload.", {
        code: "SOURCE_INPUT_INVALID",
      });
    }
    const isConfirmed = form.get("syntheticMaterialConfirmed") === "true";
    return {
      kind: "file",
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      syntheticMaterialConfirmed: isConfirmed,
      replacesSnapshotId: formText(form.get("replacesSnapshotId")),
    };
  }

  const parsed = correctedSourceTextSchema.safeParse(
    await readJsonBody(request)
  );
  if (!parsed.success) {
    throw new SourceRequestError(
      "Corrected text must be 1-30,000 characters.",
      { code: "SOURCE_INPUT_INVALID" }
    );
  }
  return {
    kind: "text",
    correctedText: parsed.data.correctedText,
    replacesSnapshotId: parsed.data.replacesSnapshotId,
  };
};

const storeUploadParts = (
  service: ReturnType<typeof createSourceService>,
  actor: TeacherActor,
  parts: UploadParts
): Promise<PublicSourceSnapshot> => {
  const replaces =
    parts.replacesSnapshotId === undefined
      ? {}
      : { replacesSnapshotId: parts.replacesSnapshotId };
  if (parts.kind === "file") {
    return service.upload({
      actor,
      fileName: parts.fileName,
      bytes: parts.bytes,
      syntheticMaterialConfirmed: parts.syntheticMaterialConfirmed,
      ...replaces,
    });
  }
  return service.addCorrectedText({
    actor,
    correctedText: parts.correctedText,
    ...replaces,
  });
};

/**
POST /api/lessons/sources — multipart file upload or JSON corrected text.
Owning teacher, mutation-protected.
*/
export const handleSourceUploadRequest = async (
  request: Request
): Promise<Response> => {
  ensureSourceCleanup();
  const resolved = await resolveProtectedTeacher(request);
  if (!resolved.ok) {
    return resolved.response;
  }

  try {
    const service = createService();
    const parts = await parseUploadParts(request);
    const snapshot = await storeUploadParts(service, resolved.actor, parts);
    return noStoreJson(snapshot, 201);
  } catch (error) {
    return mapSourceError(error);
  }
};

/**
GET /api/lessons/sources — the teacher's snapshots without extracted text.
*/
export const handleSourceListRequest = async (
  request: Request
): Promise<Response> => {
  ensureSourceCleanup();
  const resolved = await resolveProtectedTeacher(request);
  if (!resolved.ok) {
    return resolved.response;
  }

  try {
    const snapshots = await createService().list(resolved.actor);
    return noStoreJson({ snapshots });
  } catch (error) {
    return mapSourceError(error);
  }
};

/**
GET /api/lessons/sources/:sourceId — single snapshot with extracted text for teacher review.
*/
export const handleSourceReadRequest = async (
  request: Request,
  snapshotId: string
): Promise<Response> => {
  ensureSourceCleanup();
  const resolved = await resolveProtectedTeacher(request);
  if (!resolved.ok) {
    return resolved.response;
  }

  const parsedId = snapshotIdSchema.safeParse(snapshotId);
  if (!parsedId.success) {
    return identityErrorJson(new IdentityError("INVALID_INPUT"));
  }

  try {
    const snapshot = await createService().read(resolved.actor, parsedId.data);
    return noStoreJson(snapshot);
  } catch (error) {
    return mapSourceError(error);
  }
};

/**
POST /api/lessons/sources/:sourceId/cancel — cancel an extraction or remove an existing snapshot. Owning teacher, mutation-protected.
*/
export const handleSourceCancelRequest = async (
  request: Request,
  snapshotId: string
): Promise<Response> => {
  ensureSourceCleanup();
  const resolved = await resolveProtectedTeacher(request);
  if (!resolved.ok) {
    return resolved.response;
  }

  const parsedId = snapshotIdSchema.safeParse(snapshotId);
  if (!parsedId.success) {
    return identityErrorJson(new IdentityError("INVALID_INPUT"));
  }

  try {
    await createService().cancel(resolved.actor, parsedId.data);
    return noStoreJson({ snapshotId: parsedId.data, state: "cancelled" });
  } catch (error) {
    return mapSourceError(error);
  }
};

/**
POST /api/lessons/sources/:sourceId/review — teacher review completes a complete snapshot. Owning teacher, mutation-protected.
*/
export const handleSourceReviewRequest = async (
  request: Request,
  snapshotId: string
): Promise<Response> => {
  ensureSourceCleanup();
  const resolved = await resolveProtectedTeacher(request);
  if (!resolved.ok) {
    return resolved.response;
  }

  const parsedId = snapshotIdSchema.safeParse(snapshotId);
  if (!parsedId.success) {
    return identityErrorJson(new IdentityError("INVALID_INPUT"));
  }
  const parsedInput = sourceReviewInputSchema.safeParse(
    await readJsonBody(request)
  );
  if (!parsedInput.success) {
    return identityErrorJson(new IdentityError("INVALID_INPUT"));
  }

  try {
    const snapshot = await createService().review({
      actor: resolved.actor,
      snapshotId: parsedId.data,
      input: parsedInput.data,
    });
    return noStoreJson(snapshot);
  } catch (error) {
    return mapSourceError(error);
  }
};
