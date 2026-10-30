import { z } from "zod";

import { lessonGenerationInputSchema } from "@/shared/generation-contract";

import {
  guardProtectedMutation,
  identityErrorJson,
  resolveTeacherActor,
} from "../identity/api.server";
import { IdentityError } from "../identity/errors";
import { readJsonBody, noStoreJson } from "../http.server";
import { readServerConfig } from "../config";
import { createFoundationPersistence } from "../persistence";
import { createConfiguredLessonDraftProvider } from "./factory";
import { GenerationRequestError } from "./generation-request-error";
import { createGenerationService } from "./service";

import type { TeacherActor } from "../identity/types";

const createService = (): ReturnType<typeof createGenerationService> => {
  const config = readServerConfig();
  return createGenerationService({
    persistence: createFoundationPersistence(config),
    provider: createConfiguredLessonDraftProvider(config),
  });
};

type TeacherResolution =
  | { readonly ok: true; readonly actor: TeacherActor }
  | { readonly ok: false; readonly response: Response };

const resolveTeacher = async (request: Request): Promise<TeacherResolution> => {
  const resolved = await resolveTeacherActor(request);
  if (!resolved.ok) {
    return { ok: false, response: identityErrorJson(resolved.error) };
  }

  const guard = guardProtectedMutation(
    request,
    resolved.dependencies,
    resolved.sessionId
  );
  return guard
    ? { ok: false, response: identityErrorJson(guard) }
    : { ok: true, actor: resolved.actor };
};

/**
Map a generation failure to its transport response. Typed domain errors carry their own code, curated message, and status from the shared seam contract; everything else keeps the generic fallback so no internal detail escapes.
*/
export const mapGenerationError = (error: unknown): Response => {
  if (error instanceof IdentityError) {
    return identityErrorJson(error);
  }
  if (error instanceof GenerationRequestError) {
    return noStoreJson(
      { code: error.code, message: error.message },
      error.status
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
