import { isJsonObject } from "@/lib/http";
import { generationRequestErrorCodeValues } from "@/shared/generation-contract";

/**
Teacher-visible failure resolution for the generation delivery seam, kept out of the studio component so the mapping stays pure and testable.

Identity-boundary codes keep their canned copy; generation seam codes carry a curated server message that is surfaced verbatim.
*/

const ERROR_COPY = {
  rateLimited: "Too many requests right now. Wait a moment and try again.",
  unavailable:
    "Lesson generation is temporarily unavailable. Try again in a moment.",
  forbidden: "You do not have access to generate lessons for this classroom.",
  generic: "The draft could not be generated. Check the request and try again.",
} as const;

/**
The canned fallback for failures that carry no curated seam message (network
errors, unparsable payloads, unknown codes). One source of truth for the studio.
*/
export const GENERIC_GENERATION_FAILURE_MESSAGE = ERROR_COPY.generic;

/**
A resolved generation failure: the studio must re-authenticate, or show one teacher-ready message.
*/
export type GenerationFailure =
  | { readonly kind: "unauthorized" }
  | { readonly kind: "error"; readonly message: string };

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

/**
The generation delivery seam's own codes are exactly the shared contract's code list; their responses carry a curated, teacher-ready message the studio surfaces verbatim. Every other code keeps its canned copy.
*/
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
    return { kind: "error", message: ERROR_COPY.rateLimited };
  }

  if (status === 503 || code === "AUTH_UNAVAILABLE") {
    return { kind: "error", message: ERROR_COPY.unavailable };
  }

  const curated = curatedMessageOf(code, message);
  if (curated !== null) {
    return { kind: "error", message: curated };
  }

  return {
    kind: "error",
    message: isForbiddenFailure(status, code)
      ? ERROR_COPY.forbidden
      : ERROR_COPY.generic,
  };
};
