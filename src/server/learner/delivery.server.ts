import { z } from "zod";

import { readServerConfig } from "@/server/config";
import { noStoreJson, readJsonBody } from "@/server/http.server";
import {
  identityErrorJson,
  resolveProtectedLearner,
} from "@/server/identity/api.server";
import { IdentityError } from "@/server/identity/errors";
import { createRecordPersistence } from "@/server/persistence";
import { isRecordStoreError } from "@/server/records/errors";
import { createLearnerService } from "./service";

/**
 * #6 learner delivery. The body has no score field, and the schema is strict, so a tampered submission is rejected before any record work.
 */
const idSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,80}$/u, "This identifier is malformed.");

const submittedPairSchema = z.strictObject({
  sourceId: idSchema,
  targetId: idSchema,
});

export const learnerAttemptInputSchema = z.strictObject({
  operationKey: z.string().trim().min(8).max(120),
  runId: idSchema,
  itemId: idSchema,
  expectedRunRevision: z.number().int().min(0).max(1_000_000),
  priorAttemptId: idSchema.nullable(),
  pairs: z.array(submittedPairSchema).min(1).max(50),
  assistanceState: z.enum(["none", "hinted"]),
  assistanceEventIds: z.array(idSchema).max(50),
});

export const learnerRunInputSchema = z.strictObject({
  operationKey: z.string().trim().min(8).max(120),
  assignmentId: idSchema,
  assignedVariantId: idSchema,
});

const statusByCode = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 422,
  NOT_FOUND: 404,
  STALE_VERSION: 409,
  IDEMPOTENCY_CONFLICT: 409,
  PERSISTENCE_UNAVAILABLE: 503,
} as const;

const unavailableMessage =
  "The learner record is temporarily unavailable. Try again later.";

export const learnerErrorJson = (error: unknown): Response => {
  if (error instanceof IdentityError) {
    return identityErrorJson(error);
  }
  return isRecordStoreError(error)
    ? noStoreJson(
        { code: error.code, message: error.message },
        statusByCode[error.code]
      )
    : noStoreJson(
        { code: "LEARNER_UNAVAILABLE", message: unavailableMessage },
        503
      );
};

const invalidInput = (): Response => {
  return noStoreJson(
    {
      code: "LEARNER_INPUT_INVALID",
      message: "The submission is not valid.",
    },
    422
  );
};

/**
POST /api/learner/attempts — grade and record one matching submission.
*/
export const handleSubmitAttemptRequest = async (
  request: Request
): Promise<Response> => {
  const resolved = await resolveProtectedLearner(request);
  if (!resolved.ok) {
    return resolved.response;
  }

  const parsed = learnerAttemptInputSchema.safeParse(
    await readJsonBody(request)
  );
  if (!parsed.success) {
    return invalidInput();
  }

  try {
    const config = readServerConfig();
    const service = createLearnerService(createRecordPersistence(config));
    const result = await service.submitAttempt(resolved.actor, parsed.data);
    return noStoreJson(result);
  } catch (error) {
    return learnerErrorJson(error);
  }
};

/**
POST /api/learner/runs — open or replay the learner's run and return the surface.
*/
export const handleStartRunRequest = async (
  request: Request
): Promise<Response> => {
  const resolved = await resolveProtectedLearner(request);
  if (!resolved.ok) {
    return resolved.response;
  }

  const parsed = learnerRunInputSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return invalidInput();
  }

  try {
    const config = readServerConfig();
    const records = createRecordPersistence(config);
    const run = await records.startRun(resolved.actor, parsed.data);
    const lesson = await records.readLesson(resolved.actor, { runId: run.id });
    return noStoreJson({
      runId: run.id,
      runRevision: lesson.runRevision,
      lesson: lesson.lesson,
      evidence: lesson.evidence,
    });
  } catch (error) {
    return learnerErrorJson(error);
  }
};
