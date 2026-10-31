import { publicationErrorStatusByCode } from "@/shared/publication-contract";

import type {
  PublicationErrorCode,
  PublicationFinding,
} from "@/shared/publication-contract";

export interface PublicationErrorOptions extends ErrorOptions {
  findings?: readonly PublicationFinding[];
  detail?: string;
}

/**
A typed publication refusal. The delivery seam maps `code` and `status` to the
wire shape; domain code never builds an HTTP response.
*/
export class PublicationError extends Error {
  readonly code: PublicationErrorCode;
  readonly status: number;
  readonly findings: readonly PublicationFinding[];
  readonly detail?: string;

  constructor(
    code: PublicationErrorCode,
    message: string,
    options: PublicationErrorOptions = {}
  ) {
    super(message, options);
    this.name = "PublicationError";
    this.code = code;
    this.status = publicationErrorStatusByCode[code];
    this.findings = options.findings ?? [];
    if (options.detail !== undefined) {
      this.detail = options.detail;
    }
  }
}

export const publicationError = (
  code: PublicationErrorCode,
  message: string,
  options: PublicationErrorOptions = {}
): PublicationError => new PublicationError(code, message, options);
