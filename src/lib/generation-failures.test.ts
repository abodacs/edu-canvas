import { describe, expect, it } from "vitest";

import { generationRequestErrorStatusByCode } from "@/shared/generation-contract";

import { resolveFailure } from "./generation-failures";

const CURATED_REJECTION_MESSAGE =
  "This learning objective is not supported. Use Grade 4 equivalent fractions (4.NF.A.1).";

const GENERIC_MESSAGE =
  "The draft could not be generated. Check the request and try again.";

const payloadWith = (code: string, message?: unknown): unknown =>
  message === undefined ? { code } : { code, message };

describe("generation failure resolution", () => {
  it("prefers the curated server message for a generation seam code", () => {
    expect(
      resolveFailure(
        422,
        payloadWith("GENERATION_INPUT_INVALID", CURATED_REJECTION_MESSAGE)
      )
    ).toStrictEqual({ kind: "error", message: CURATED_REJECTION_MESSAGE });
  });

  it.each(Object.entries(generationRequestErrorStatusByCode))(
    "surfaces the server message for %s",
    (code, status) => {
      const serverMessage = `curated: ${code}`;

      expect(
        resolveFailure(status, payloadWith(code, serverMessage))
      ).toStrictEqual({
        kind: "error",
        message: serverMessage,
      });
    }
  );

  it("keeps the canned copy when no curated message accompanies the code", () => {
    expect(
      resolveFailure(422, payloadWith("GENERATION_INPUT_INVALID"))
    ).toStrictEqual({ kind: "error", message: GENERIC_MESSAGE });
  });

  it("keeps the canned copy for existing codes even when a message is present", () => {
    expect(
      resolveFailure(
        500,
        payloadWith("GENERATION_FAILED", "ignored server text")
      )
    ).toStrictEqual({ kind: "error", message: GENERIC_MESSAGE });
  });

  it("falls back to the canned copy when a curated message is blank", () => {
    expect(
      resolveFailure(409, payloadWith("IDEMPOTENCY_CONFLICT", " ".repeat(3)))
    ).toStrictEqual({ kind: "error", message: GENERIC_MESSAGE });
  });

  it("keeps the forbidden copy for access rejections", () => {
    expect(
      resolveFailure(403, payloadWith("FORBIDDEN", "ignored"))
    ).toStrictEqual({
      kind: "error",
      message: "You do not have access to generate lessons for this classroom.",
    });
    expect(resolveFailure(200, payloadWith("CSRF_REJECTED"))).toStrictEqual({
      kind: "error",
      message: "You do not have access to generate lessons for this classroom.",
    });
  });

  it("keeps the canned copy for other transport failures", () => {
    expect(resolveFailure(422, payloadWith("INVALID_INPUT"))).toStrictEqual({
      kind: "error",
      message: GENERIC_MESSAGE,
    });
    expect(resolveFailure(429, payloadWith("RATE_LIMITED"))).toStrictEqual({
      kind: "error",
      message: "Too many requests right now. Wait a moment and try again.",
    });
    expect(resolveFailure(503, payloadWith("AUTH_UNAVAILABLE"))).toStrictEqual({
      kind: "error",
      message:
        "Lesson generation is temporarily unavailable. Try again in a moment.",
    });
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
    expect(resolveFailure(422, { code: 42 })).toStrictEqual({
      kind: "error",
      message: GENERIC_MESSAGE,
    });
    expect(resolveFailure(422, "not-a-record")).toStrictEqual({
      kind: "error",
      message: GENERIC_MESSAGE,
    });
    expect(resolveFailure(422, undefined)).toStrictEqual({
      kind: "error",
      message: GENERIC_MESSAGE,
    });
    expect(
      resolveFailure(422, payloadWith("GENERATION_INPUT_INVALID", 7))
    ).toStrictEqual({ kind: "error", message: GENERIC_MESSAGE });
  });
});
