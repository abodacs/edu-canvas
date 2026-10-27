export type GenerationRequestErrorCode =
  | "IDEMPOTENCY_CONFLICT"
  | "MODERATION_REVISION_REQUIRED"
  | "DRAFT_NOT_FOUND"
  | "DRAFT_NOT_RETRYABLE"
  | "RETRY_METADATA_MISMATCH"
  | "DRAFT_SUPERSEDED"
  | "CANCELLATION_FORBIDDEN";

export interface GenerationRequestErrorOptions extends ErrorOptions {
  code?: GenerationRequestErrorCode;
}

export class GenerationRequestError extends Error {
  readonly code?: GenerationRequestErrorCode;

  constructor(message: string, options: GenerationRequestErrorOptions = {}) {
    super(message, options);
    this.name = "GenerationRequestError";
    this.code = options.code;
  }
}
