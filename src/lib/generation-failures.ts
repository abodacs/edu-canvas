import { isJsonObject } from "@/lib/http";
import { generationRequestErrorCodeValues } from "@/shared/generation-contract";

import type { GenerationRequestErrorCode } from "@/shared/generation-contract";

const ERROR_COPY = {
  rateLimited: "Too many requests right now. Wait a moment and try again.",
  unavailable:
    "Lesson generation is temporarily unavailable. Try again in a moment.",
  forbidden: "You do not have access to generate lessons for this classroom.",
  generic: "The draft could not be generated. Check the request and try again.",
} as const;

export const GENERIC_GENERATION_FAILURE_MESSAGE = ERROR_COPY.generic;

export type GenerationFailure =
  | { readonly kind: "unauthorized" }
  | {
      readonly kind: "error";
      readonly message: string;
      readonly code: GenerationRequestErrorCode | null;
    };

interface FailurePayload {
  readonly code: string | null;
  readonly message: unknown;
}

const readFailurePayload = (payload: unknown): FailurePayload => {
  if (!isJsonObject(payload)) {
    return { code: null, message: null };
  }
  const { code, message } = payload;
  return { code: typeof code === "string" ? code : null, message };
};

const SEAM_CODES: ReadonlySet<string> = new Set(
  generationRequestErrorCodeValues
);

const isCuratedSeamMessage = (
  code: string | null,
  message: unknown
): message is string => {
  return (
    typeof message === "string" &&
    message.trim() !== "" &&
    code !== null &&
    SEAM_CODES.has(code)
  );
};

const curatedMessageOf = (
  code: string | null,
  message: unknown
): string | null => (isCuratedSeamMessage(code, message) ? message : null);

const seamCodeOf = (code: string | null): GenerationRequestErrorCode | null => {
  return (
    generationRequestErrorCodeValues.find((value) => value === code) ?? null
  );
};

const FORBIDDEN_ERROR_CODES: ReadonlySet<string> = new Set([
  "FORBIDDEN",
  "CSRF_REJECTED",
  "ACCESS_NOT_PROVISIONED",
]);

const isForbiddenFailure = (status: number, code: string | null): boolean =>
  status === 403 || (code !== null && FORBIDDEN_ERROR_CODES.has(code));

export const resolveFailure = (
  status: number,
  payload: unknown
): GenerationFailure => {
  const { code, message } = readFailurePayload(payload);

  if (status === 401 || code === "UNAUTHENTICATED") {
    return { kind: "unauthorized" };
  }

  if (status === 429 || code === "RATE_LIMITED") {
    const curated = curatedMessageOf(code, message);
    return {
      kind: "error",
      message: curated ?? ERROR_COPY.rateLimited,
      code: curated === null ? null : seamCodeOf(code),
    };
  }

  if (status === 503 || code === "AUTH_UNAVAILABLE") {
    return { kind: "error", message: ERROR_COPY.unavailable, code: null };
  }

  const curated = curatedMessageOf(code, message);
  if (curated !== null) {
    return { kind: "error", message: curated, code: seamCodeOf(code) };
  }

  return {
    kind: "error",
    message: isForbiddenFailure(status, code)
      ? ERROR_COPY.forbidden
      : ERROR_COPY.generic,
    code: seamCodeOf(code),
  };
};
