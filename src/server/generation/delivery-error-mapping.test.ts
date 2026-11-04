import { describe, expect, it } from "vitest";

import { generationRequestErrorStatusByCode } from "@/shared/generation-contract";

import { IdentityError } from "../identity/errors";
import { GenerationLimitError } from "../limits/errors";
import { mapAdvisoryReviewError, mapGenerationError } from "./delivery.server";
import { AdvisoryReviewError } from "./advisory-review";
import {
  GenerationRequestError,
  GENERATION_INPUT_INVALID_MESSAGE,
} from "./generation-request-error";

import type { GenerationRequestErrorCode } from "@/shared/generation-contract";

const UNSUPPORTED_OBJECTIVE_MESSAGE =
  "This learning objective is not supported. Choose a supported standard.";

const FALLBACK_BODY = {
  code: "GENERATION_FAILED",
  message: "The draft could not be completed. Try again.",
} as const;

const requestErrorCodes = Object.keys(
  generationRequestErrorStatusByCode
) as GenerationRequestErrorCode[];

const errorBodyOf = async (
  response: Response
): Promise<{
  code?: string;
  message?: string;
  retryAfterSeconds?: number;
}> => {
  return (await response.json()) as {
    code?: string;
    message?: string;
    retryAfterSeconds?: number;
  };
};

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

  it("states the real retry window on a rate-limited 429", async () => {
    const response = mapGenerationError(new GenerationLimitError(42_000));
    const body = await errorBodyOf(response);

    expect({
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      ...body,
    }).toStrictEqual({
      status: 429,
      retryAfter: "42",
      code: "RATE_LIMITED",
      retryAfterSeconds: 42,
      message:
        "Too many generation requests right now. Try again in 42 seconds.",
    });
  });
});

describe("advisory review delivery error mapping", () => {
  it.each([
    ["ADVISORY_REVIEW_FORBIDDEN", 403],
    ["ADVISORY_REVIEW_NOT_READY", 409],
    ["ADVISORY_REVIEW_STALE", 409],
  ] as const)("%s keeps its typed status", async (code, status) => {
    const response = mapAdvisoryReviewError(
      new AdvisoryReviewError(code, `advisory review refused: ${code}`)
    );

    expect({
      status: response.status,
      ...(await errorBodyOf(response)),
    }).toStrictEqual({
      status,
      code,
      message: `advisory review refused: ${code}`,
    });
  });

  it("maps an unavailable provider to a 503 without leaking the cause", async () => {
    const response = mapAdvisoryReviewError(
      new Error("connect ECONNREFUSED 127.0.0.1")
    );

    expect({
      status: response.status,
      ...(await errorBodyOf(response)),
    }).toStrictEqual({
      status: 503,
      code: "ADVISORY_REVIEW_UNAVAILABLE",
      message:
        "The advisory review is temporarily unavailable. Try again later.",
    });
  });

  it("keeps the identity guard rejection as a 403", async () => {
    const response = mapAdvisoryReviewError(new IdentityError("FORBIDDEN"));

    expect({
      status: response.status,
      ...(await errorBodyOf(response)),
    }).toStrictEqual({
      status: 403,
      code: "FORBIDDEN",
      message: "You do not have access to this resource.",
    });
  });
});
