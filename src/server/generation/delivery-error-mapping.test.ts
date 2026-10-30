import { describe, expect, it } from "vitest";

import {
  GENERATION_INPUT_ERROR_CODE,
  mapGenerationError,
} from "./delivery.server";
import { GenerationInputError } from "./generation-input-error";
import { GenerationRequestError } from "./generation-request-error";

import type { GenerationRequestErrorCode } from "./generation-request-error";

const UNSUPPORTED_OBJECTIVE_MESSAGE =
  "This learning objective is not supported. Use Grade 4 equivalent fractions (4.NF.A.1).";

const FALLBACK_BODY = {
  code: "GENERATION_FAILED",
  message: "The draft could not be completed. Try again.",
} as const;

/**
The intended transport status for every generation request error code, per the
design-doc conventions (§ error table): not-found is 404, conflict-family codes
are 409, and a request that must be revised is 422.
*/
const expectedStatusByRequestErrorCode: Record<
  GenerationRequestErrorCode,
  number
> = {
  IDEMPOTENCY_CONFLICT: 409,
  MODERATION_REVISION_REQUIRED: 422,
  DRAFT_NOT_FOUND: 404,
  DRAFT_NOT_RETRYABLE: 409,
  RETRY_METADATA_MISMATCH: 409,
  DRAFT_SUPERSEDED: 409,
  CANCELLATION_FORBIDDEN: 409,
};

const requestErrorCodes = Object.keys(
  expectedStatusByRequestErrorCode
) as GenerationRequestErrorCode[];

const errorBodyOf = async (
  response: Response
): Promise<{ code?: string; message?: string }> =>
  (await response.json()) as { code?: string; message?: string };

describe("generation delivery error mapping", () => {
  it("rejects an unsupported objective with an explicit 422 code and the curated message", async () => {
    const response = mapGenerationError(
      new GenerationInputError(UNSUPPORTED_OBJECTIVE_MESSAGE)
    );

    expect({
      status: response.status,
      ...(await errorBodyOf(response)),
    }).toStrictEqual({
      status: 422,
      code: GENERATION_INPUT_ERROR_CODE,
      message: UNSUPPORTED_OBJECTIVE_MESSAGE,
    });
  });

  it("maps the default input rejection to 422 without inventing copy", async () => {
    const response = mapGenerationError(new GenerationInputError());

    expect({
      status: response.status,
      ...(await errorBodyOf(response)),
    }).toStrictEqual({
      status: 422,
      code: GENERATION_INPUT_ERROR_CODE,
      message: "Generation input is invalid.",
    });
  });

  it.each(requestErrorCodes)(
    "%s maps to its precise transport status and its own message",
    async (code) => {
      const message = `request failed: ${code}`;
      const response = mapGenerationError(
        new GenerationRequestError(message, { code })
      );

      expect({
        status: response.status,
        ...(await errorBodyOf(response)),
      }).toStrictEqual({
        status: expectedStatusByRequestErrorCode[code],
        code,
        message,
      });
    }
  );

  it("keeps the generic 500 fallback for an uncoded request error", async () => {
    const response = mapGenerationError(
      new GenerationRequestError(
        "Only a verified teacher can generate lesson drafts."
      )
    );

    expect({
      status: response.status,
      ...(await errorBodyOf(response)),
    }).toStrictEqual({ status: 500, ...FALLBACK_BODY });
  });

  it("keeps the generic 500 fallback for an unexpected error", async () => {
    const response = mapGenerationError(new Error("unexpected provider crash"));

    expect({
      status: response.status,
      ...(await errorBodyOf(response)),
    }).toStrictEqual({ status: 500, ...FALLBACK_BODY });
  });
});
