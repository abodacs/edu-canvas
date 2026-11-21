import { noStoreJson } from "@/server/http.server";
import { identityErrorJson } from "@/server/identity/api.server";
import { IdentityError } from "@/server/identity/errors";
import { isRecordStoreError } from "@/server/records/errors";

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

export interface RecordStoreUnavailableFallback {
  readonly code: string;
  readonly message: string;
}

export const recordStoreErrorResponse = (
  error: unknown,
  unavailable: RecordStoreUnavailableFallback
): Response => {
  if (error instanceof IdentityError) {
    return identityErrorJson(error);
  }
  if (!isRecordStoreError(error)) {
    console.error("[records] unhandled failure", error);
  }
  return isRecordStoreError(error)
    ? noStoreJson(
        { code: error.code, message: error.message },
        statusByCode[error.code]
      )
    : noStoreJson(
        { code: unavailable.code, message: unavailable.message },
        503
      );
};
