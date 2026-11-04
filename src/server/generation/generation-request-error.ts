import { generationRequestErrorStatusByCode } from "@/shared/generation-contract";

import type { GenerationRequestErrorCode } from "@/shared/generation-contract";

/**
The curated default copy for a rejected generation input; a caller rejects a specific field by passing its own teacher-ready message instead.
*/
export const GENERATION_INPUT_INVALID_MESSAGE = "Generation input is invalid.";

/**
 * Rejected when no standards pack resolves the requested standard. The copy is
 * deliberately generic: naming a different lesson would send the teacher to
 * work the product does not think they asked for.
 */
export const GENERATION_STANDARD_UNSUPPORTED_MESSAGE =
  "This learning objective is not supported. Choose a supported standard.";

export interface GenerationRequestErrorOptions extends ErrorOptions {
  code: GenerationRequestErrorCode;
  /**
  Present only for `RATE_LIMITED`; the transport states the same wait in the
  body and the `Retry-After` header.
  */
  retryAfterMs?: number;
}

/**
Every generation request rejection carries a code from the shared seam
contract and the transport status that code maps to, the way `IdentityError`
carries its own status.
*/
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
