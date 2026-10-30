import { generationRequestErrorStatusByCode } from "@/shared/generation-contract";

import type { GenerationRequestErrorCode } from "@/shared/generation-contract";

/**
The curated default copy for a rejected generation input; a caller rejects a specific field by passing its own teacher-ready message instead.
*/
export const GENERATION_INPUT_INVALID_MESSAGE = "Generation input is invalid.";

export interface GenerationRequestErrorOptions extends ErrorOptions {
  code: GenerationRequestErrorCode;
}

/**
Every generation request rejection carries a code from the shared seam
contract and the transport status that code maps to, the way `IdentityError`
carries its own status.
*/
export class GenerationRequestError extends Error {
  readonly code: GenerationRequestErrorCode;
  readonly status: number;

  constructor(message: string, options: GenerationRequestErrorOptions) {
    super(message, options);
    this.name = "GenerationRequestError";
    this.code = options.code;
    this.status = generationRequestErrorStatusByCode[options.code];
  }
}

export { type GenerationRequestErrorCode } from "@/shared/generation-contract";
