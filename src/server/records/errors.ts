export const recordErrorCodeValues = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INVALID_INPUT",
  "NOT_FOUND",
  "STALE_VERSION",
  "IDEMPOTENCY_CONFLICT",
  "PERSISTENCE_UNAVAILABLE",
] as const;
export type RecordErrorCode = (typeof recordErrorCodeValues)[number];

const safeMessageByCode: Record<RecordErrorCode, string> = {
  UNAUTHENTICATED: "Sign in to continue.",
  FORBIDDEN: "You do not have access to this resource.",
  INVALID_INPUT: "Check the details you entered and try again.",
  NOT_FOUND: "That record does not exist.",
  STALE_VERSION: "Refresh and try again; this record changed.",
  IDEMPOTENCY_CONFLICT: "That operation key was already used for other input.",
  PERSISTENCE_UNAVAILABLE: "Records are temporarily unavailable.",
};

/**
 * The single error type the records boundary throws. The message is always the safe message for the code, so a caller can serialize it without leaking stored content or another tenant's identifiers.
 */
export class RecordStoreError extends Error {
  readonly code: RecordErrorCode;

  constructor(code: RecordErrorCode, options?: ErrorOptions) {
    super(safeMessageByCode[code], options);
    this.name = "RecordStoreError";
    this.code = code;
  }
}

export const isRecordStoreError = (value: unknown): value is RecordStoreError =>
  value instanceof RecordStoreError;

export const recordError = (
  code: RecordErrorCode,
  options?: ErrorOptions
): RecordStoreError => new RecordStoreError(code, options);
