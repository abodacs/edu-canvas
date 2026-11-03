import { readServerConfig } from "@/server/config";
import { noStoreJson } from "@/server/http.server";
import {
  identityErrorJson,
  resolveTeacherActor,
} from "@/server/identity/api.server";
import { IdentityError } from "@/server/identity/errors";
import { createRecordPersistence } from "@/server/persistence";
import { isRecordStoreError } from "@/server/records/errors";
import { teacherProgressResponseSchema } from "@/shared/progress-contract";

const statusByCode = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 422,
  NOT_FOUND: 404,
  STALE_VERSION: 409,
  ATTEMPT_LIMIT_REACHED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  PERSISTENCE_UNAVAILABLE: 503,
} as const;

const unavailableMessage =
  "Results are temporarily unavailable. Try again later.";

export const progressErrorJson = (error: unknown): Response => {
  if (error instanceof IdentityError) {
    return identityErrorJson(error);
  }
  return isRecordStoreError(error)
    ? noStoreJson(
        { code: error.code, message: error.message },
        statusByCode[error.code]
      )
    : noStoreJson(
        { code: "PROGRESS_UNAVAILABLE", message: unavailableMessage },
        503
      );
};

/**
GET /api/teacher/progress — the signed-in teacher's read-only results view over committed attempts and the stored next-activity decisions. No body is accepted and nothing here mutates a record.
*/
export const handleTeacherProgressRequest = async (
  request: Request
): Promise<Response> => {
  const resolved = await resolveTeacherActor(request);
  if (!resolved.ok) {
    return identityErrorJson(resolved.error);
  }

  try {
    const config = readServerConfig();
    const records = createRecordPersistence(config);
    const progress = await records.readTeacherProgress(resolved.actor);
    return noStoreJson(teacherProgressResponseSchema.parse(progress));
  } catch (error) {
    return progressErrorJson(error);
  }
};
