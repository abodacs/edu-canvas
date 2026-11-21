import { generationRequestErrorStatusByCode } from "@/shared/generation-contract";

import type { GenerationRequestErrorCode } from "@/shared/generation-contract";

export const GENERATION_INPUT_INVALID_MESSAGE = "Generation input is invalid.";

export const GENERATION_STANDARD_UNSUPPORTED_MESSAGE =
  "This learning objective is not supported. Choose a supported standard.";

export interface GenerationRequestErrorOptions extends ErrorOptions {
  code: GenerationRequestErrorCode;
  retryAfterMs?: number;
}

export class GenerationRequestError extends Error {
  readonly code: GenerationRequestErrorCode;
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(message: string, options: GenerationRequestErrorOptions) {
    super(message, options);
    this.name = "GenerationRequestError";
    this.code = options.code;
    this.status = generationRequestErrorStatusByCode[options.code];
    this.retryAfterMs = options.retryAfterMs;
  }
}

export { type GenerationRequestErrorCode } from "@/shared/generation-contract";
