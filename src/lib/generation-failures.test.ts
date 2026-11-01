import { describe, expect, it } from "vitest";

import { generationRequestErrorStatusByCode } from "@/shared/generation-contract";

import { resolveFailure } from "./generation-failures";

import type { GenerationRequestErrorCode } from "@/shared/generation-contract";

const CURATED_REJECTION_MESSAGE =
  "This learning objective is not supported. Use Grade 4 equivalent fractions (4.NF.A.1).";

const GENERIC_MESSAGE =
  "The draft could not be generated. Check the request and try again.";

const payloadWith = (code: string, message?: unknown): unknown =>
  message === undefined ? { code } : { code, message };

const errorFailure = (
  message: string,
  code: GenerationRequestErrorCode | null = null
) => ({ kind: "error", message, code });

describe("generation failure resolution", () => {
  it("prefers the curated server message for a generation seam code", () => {
    expect(
      resolveFailure(
        422,
        payloadWith("GENERATION_INPUT_INVALID", CURATED_REJECTION_MESSAGE)
      )
    ).toStrictEqual(
      errorFailure(CURATED_REJECTION_MESSAGE, "GENERATION_INPUT_INVALID")
    );
  });

  it.each(Object.entries(generationRequestErrorStatusByCode))(
    "surfaces the server message and the code for %s",
    (code, status) => {
      const serverMessage = `curated: ${code}`;

      expect(
        resolveFailure(status, payloadWith(code, serverMessage))
      ).toStrictEqual(
        errorFailure(serverMessage, code as GenerationRequestErrorCode)
      );
    }
  );

  it("offers the revision panel's code to the studio", () => {
    expect(
      resolveFailure(
        422,
        payloadWith(
          "MODERATION_REVISION_REQUIRED",
          "A previous request with the same lesson input was blocked by safety review."
        )
      )
    ).toStrictEqual(
      errorFailure(
        "A previous request with the same lesson input was blocked by safety review.",
        "MODERATION_REVISION_REQUIRED"
      )
    );
  });

  it("keeps the canned copy when no curated message accompanies the code", () => {
    expect(
      resolveFailure(422, payloadWith("GENERATION_INPUT_INVALID"))
    ).toStrictEqual(errorFailure(GENERIC_MESSAGE, "GENERATION_INPUT_INVALID"));
  });

  it("keeps the canned copy for existing codes even when a message is present", () => {
    expect(
      resolveFailure(
        500,
        payloadWith("GENERATION_FAILED", "ignored server text")
      )
    ).toStrictEqual(errorFailure(GENERIC_MESSAGE));
  });

  it("falls back to the canned copy when a curated message is blank", () => {
    expect(
      resolveFailure(409, payloadWith("IDEMPOTENCY_CONFLICT", " ".repeat(3)))
    ).toStrictEqual(errorFailure(GENERIC_MESSAGE, "IDEMPOTENCY_CONFLICT"));
  });

  it("keeps the forbidden copy for access rejections", () => {
    const forbidden =
      "You do not have access to generate lessons for this classroom.";

    expect(
      resolveFailure(403, payloadWith("FORBIDDEN", "ignored"))
    ).toStrictEqual(errorFailure(forbidden));
    expect(resolveFailure(200, payloadWith("CSRF_REJECTED"))).toStrictEqual(
      errorFailure(forbidden)
    );
  });

  it("keeps the canned copy for other transport failures", () => {
    expect(resolveFailure(422, payloadWith("INVALID_INPUT"))).toStrictEqual(
      errorFailure(GENERIC_MESSAGE)
    );
    expect(resolveFailure(429, payloadWith("RATE_LIMITED"))).toStrictEqual(
      errorFailure("Too many requests right now. Wait a moment and try again.")
    );
    expect(resolveFailure(503, payloadWith("AUTH_UNAVAILABLE"))).toStrictEqual(
      errorFailure(
        "Lesson generation is temporarily unavailable. Try again in a moment."
      )
    );
  });

  it("marks an unauthenticated failure without a message", () => {
    expect(resolveFailure(401, payloadWith("UNAUTHENTICATED"))).toStrictEqual({
      kind: "unauthorized",
    });
    expect(resolveFailure(401, "not-a-record")).toStrictEqual({
      kind: "unauthorized",
    });
  });

  it("reads the failure payload defensively", () => {
    expect(resolveFailure(422, { code: 42 })).toStrictEqual(
      errorFailure(GENERIC_MESSAGE)
    );
    expect(resolveFailure(422, "not-a-record")).toStrictEqual(
      errorFailure(GENERIC_MESSAGE)
    );
    expect(resolveFailure(422, undefined)).toStrictEqual(
      errorFailure(GENERIC_MESSAGE)
    );
    expect(
      resolveFailure(422, payloadWith("GENERATION_INPUT_INVALID", 7))
    ).toStrictEqual(errorFailure(GENERIC_MESSAGE, "GENERATION_INPUT_INVALID"));
  });
});
