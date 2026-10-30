import { describe, expect, it } from "vitest";

import {
  readErrorCode,
  readServerCuratedMessage,
  resolveFailure,
} from "./generation-failures";

const CURATED_REJECTION_MESSAGE =
  "This learning objective is not supported. Use Grade 4 equivalent fractions (4.NF.A.1).";

const payloadWith = (code: string, message?: unknown): unknown =>
  message === undefined ? { code } : { code, message };

describe("generation failure resolution", () => {
  it("prefers the curated server message for a generation seam code", () => {
    expect(
      resolveFailure(422, "GENERATION_INPUT_INVALID", CURATED_REJECTION_MESSAGE)
    ).toStrictEqual({
      unauthorized: false,
      message: CURATED_REJECTION_MESSAGE,
    });
  });

  it.each([
    ["IDEMPOTENCY_CONFLICT", 409],
    ["MODERATION_REVISION_REQUIRED", 422],
    ["DRAFT_NOT_FOUND", 404],
    ["DRAFT_NOT_RETRYABLE", 409],
    ["RETRY_METADATA_MISMATCH", 409],
    ["DRAFT_SUPERSEDED", 409],
    ["CANCELLATION_FORBIDDEN", 409],
  ] as const)("surfaces the server message for %s", (code, status) => {
    const serverMessage = `curated: ${code}`;

    expect(resolveFailure(status, code, serverMessage)).toStrictEqual({
      unauthorized: false,
      message: serverMessage,
    });
  });

  it("keeps the canned copy when no curated message accompanies the code", () => {
    expect(resolveFailure(422, "GENERATION_INPUT_INVALID", null)).toStrictEqual(
      {
        unauthorized: false,
        message:
          "The draft could not be generated. Check the request and try again.",
      }
    );
  });

  it("keeps the canned copy for existing codes even when a message is present", () => {
    expect(
      resolveFailure(500, "GENERATION_FAILED", "ignored server text")
    ).toStrictEqual({
      unauthorized: false,
      message:
        "The draft could not be generated. Check the request and try again.",
    });
  });

  it("falls back to the canned copy when a curated message is blank", () => {
    expect(
      resolveFailure(409, "IDEMPOTENCY_CONFLICT", " ".repeat(3))
    ).toStrictEqual({
      unauthorized: false,
      message:
        "The draft could not be generated. Check the request and try again.",
    });
  });

  it("keeps the forbidden copy for access rejections", () => {
    expect(resolveFailure(403, "FORBIDDEN", "ignored")).toStrictEqual({
      unauthorized: false,
      message: "You do not have access to generate lessons for this classroom.",
    });
    expect(resolveFailure(200, "CSRF_REJECTED")).toStrictEqual({
      unauthorized: false,
      message: "You do not have access to generate lessons for this classroom.",
    });
  });

  it("keeps the canned copy for other transport failures", () => {
    expect(resolveFailure(422, "INVALID_INPUT")).toStrictEqual({
      unauthorized: false,
      message:
        "The draft could not be generated. Check the request and try again.",
    });
    expect(resolveFailure(429, "RATE_LIMITED")).toStrictEqual({
      unauthorized: false,
      message: "Too many requests right now. Wait a moment and try again.",
    });
    expect(resolveFailure(503, "AUTH_UNAVAILABLE")).toStrictEqual({
      unauthorized: false,
      message:
        "Lesson generation is temporarily unavailable. Try again in a moment.",
    });
  });

  it("marks an unauthenticated failure without a message", () => {
    expect(resolveFailure(401, "UNAUTHENTICATED")).toStrictEqual({
      unauthorized: true,
      message: "",
    });
  });

  it("reads the code from a JSON payload", () => {
    expect(readErrorCode(payloadWith("GENERATION_INPUT_INVALID"))).toBe(
      "GENERATION_INPUT_INVALID"
    );
    expect(readErrorCode({ code: 42 })).toBeNull();
    expect(readErrorCode("not-a-record")).toBeNull();
    expect(readErrorCode(undefined)).toBeNull();
  });

  it("reads the curated message only for a generation seam code with a non-empty message", () => {
    expect(
      readServerCuratedMessage(
        payloadWith("GENERATION_INPUT_INVALID", CURATED_REJECTION_MESSAGE)
      )
    ).toBe(CURATED_REJECTION_MESSAGE);
    expect(
      readServerCuratedMessage(payloadWith("GENERATION_INPUT_INVALID", ""))
    ).toBeNull();
    expect(
      readServerCuratedMessage(payloadWith("GENERATION_INPUT_INVALID", 7))
    ).toBeNull();
    expect(
      readServerCuratedMessage(payloadWith("GENERATION_FAILED", "generic"))
    ).toBeNull();
    expect(readServerCuratedMessage("not-a-record")).toBeNull();
  });
});
