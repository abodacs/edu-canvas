import { readServerConfig } from "@/server/config";
import { noStoreJson } from "@/server/http.server";
import {
  identityErrorJson,
  resolveTeacherActor,
} from "@/server/identity/api.server";
import { createRecordPersistence } from "@/server/persistence";
import { teacherProgressResponseSchema } from "@/shared/progress-contract";
import { recordStoreErrorResponse } from "./error-transport";

const unavailableMessage =
  "Results are temporarily unavailable. Try again later.";

export const progressErrorJson = (error: unknown): Response => {
  return recordStoreErrorResponse(error, {
    code: "PROGRESS_UNAVAILABLE",
    message: unavailableMessage,
  });
};

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
