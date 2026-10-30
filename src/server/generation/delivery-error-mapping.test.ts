import { describe, expect, it } from "vitest";

import { generationRequestErrorStatusByCode } from "@/shared/generation-contract";

import { IdentityError } from "../identity/errors";
import { mapGenerationError } from "./delivery.server";
import {
  GenerationRequestError,
  GENERATION_INPUT_INVALID_MESSAGE,
} from "./generation-request-error";

import type { GenerationRequestErrorCode } from "@/shared/generation-contract";

const UNSUPPORTED_OBJECTIVE_MESSAGE =
  "This learning objective is not supported. Use Grade 4 equivalent fractions (4.NF.A.1).";

const FALLBACK_BODY = {
  code: "GENERATION_FAILED",
  message: "The draft could not be completed. Try again.",
} as const;

const requestErrorCodes = Object.keys(
  generationRequestErrorStatusByCode
) as GenerationRequestErrorCode[];

const errorBodyOf = async (
  response: Response
): Promise<{ code?: string; message?: string }> =>
  (await response.json()) as { code?: string; message?: string };

describe("generation delivery error mapping", () => {
  it("rejects an unsupported objective with an explicit 422 code and the curated message", async () => {
    const response = mapGenerationError(
      new GenerationRequestError(UNSUPPORTED_OBJECTIVE_MESSAGE, {
        code: "GENERATION_INPUT_INVALID",
      })
    );

    expect({
      status: response.status,
      ...(await errorBodyOf(response)),
    }).toStrictEqual({
      status: 422,
      code: "GENERATION_INPUT_INVALID",
      message: UNSUPPORTED_OBJECTIVE_MESSAGE,
    });
  });

  it("maps the default input rejection to 422 without inventing copy", async () => {
    const response = mapGenerationError(
      new GenerationRequestError(GENERATION_INPUT_INVALID_MESSAGE, {
        code: "GENERATION_INPUT_INVALID",
      })
    );

    expect({
      status: response.status,
      ...(await errorBodyOf(response)),
    }).toStrictEqual({
      status: 422,
      code: "GENERATION_INPUT_INVALID",
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
        status: generationRequestErrorStatusByCode[code],
        code,
        message,
      });
    }
  );

  it("maps the teacher guard rejection to the identity forbidden response", async () => {
    const response = mapGenerationError(new IdentityError("FORBIDDEN"));

    expect({
      status: response.status,
      ...(await errorBodyOf(response)),
    }).toStrictEqual({
      status: 403,
      code: "FORBIDDEN",
      message: "You do not have access to this resource.",
    });
  });

  it("keeps the generic 500 fallback for an unexpected error", async () => {
    const response = mapGenerationError(new Error("unexpected provider crash"));

    expect({
      status: response.status,
      ...(await errorBodyOf(response)),
    }).toStrictEqual({ status: 500, ...FALLBACK_BODY });
  });
});
