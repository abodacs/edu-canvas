import { z } from "zod";

import { lessonGenerationInputSchema } from "@/shared/generation-contract";

import {
  guardProtectedMutation,
  identityErrorJson,
  resolveAuthDependencies,
  resolveRequestSession,
} from "../identity/api.server";
import { IdentityError } from "../identity/errors";
import { readServerConfig } from "../config";
import { createFoundationPersistence } from "../persistence";
import { createConfiguredLessonDraftProvider } from "./factory";
import { createGenerationService } from "./service";

import type { TeacherActor } from "../identity/types";

const noStoreJson = (payload: unknown, status = 200): Response =>
  Response.json(payload, { status, headers: { "cache-control": "no-store" } });

const createService = (): ReturnType<typeof createGenerationService> => {
  const config = readServerConfig();
  return createGenerationService({
    persistence: createFoundationPersistence(config),
    provider: createConfiguredLessonDraftProvider(config),
  });
};

const readBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};

type TeacherResolution =
  | { readonly ok: true; readonly actor: TeacherActor }
  | { readonly ok: false; readonly response: Response };

const resolveTeacher = async (request: Request): Promise<TeacherResolution> => {
  const config = readServerConfig();
  if (config.issues.length > 0) {
    return {
      ok: false,
      response: identityErrorJson(new IdentityError("AUTH_UNAVAILABLE")),
    };
  }

  let dependencies;
  try {
    dependencies = await resolveAuthDependencies(config);
  } catch {
    return {
      ok: false,
      response: identityErrorJson(new IdentityError("AUTH_UNAVAILABLE")),
    };
  }

  const resolution = await resolveRequestSession(request, dependencies);
  if (resolution.status === "unavailable") {
    return {
      ok: false,
      response: identityErrorJson(new IdentityError("AUTH_UNAVAILABLE")),
    };
  }
  if (resolution.status === "unauthenticated") {
    return {
      ok: false,
      response: identityErrorJson(new IdentityError("UNAUTHENTICATED")),
    };
  }
  if (resolution.actor.role !== "teacher") {
    return {
      ok: false,
      response: identityErrorJson(new IdentityError("FORBIDDEN")),
    };
  }

  const guard = guardProtectedMutation(
    request,
    dependencies,
    resolution.session.sessionId
  );
  return guard
    ? { ok: false, response: identityErrorJson(guard) }
    : { ok: true, actor: resolution.actor };
};

const mapGenerationError = (error: unknown): Response => {
  if (error instanceof IdentityError) {
    return identityErrorJson(error);
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

  const parsed = lessonGenerationInputSchema.safeParse(await readBody(request));
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
