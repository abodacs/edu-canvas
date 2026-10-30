/**
Teacher-visible failure resolution for the generation delivery seam, kept out of the studio component so the mapping stays pure and testable.

Identity-boundary codes keep their canned copy; generation seam codes carry a curated server message that is surfaced verbatim.
*/

export interface GenerationFailure {
  readonly unauthorized: boolean;
  readonly message: string;
}

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const readErrorCode = (payload: unknown): string | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const { code } = payload;
  return typeof code === "string" ? code : null;
};

/**
Codes the generation delivery seam owns. Their responses carry a curated, teacher-ready message, so the studio surfaces it verbatim; every other code keeps its canned copy.
*/
const SERVER_CURATED_MESSAGE_CODES: ReadonlySet<string> = new Set([
  "GENERATION_INPUT_INVALID",
  "IDEMPOTENCY_CONFLICT",
  "MODERATION_REVISION_REQUIRED",
  "DRAFT_NOT_FOUND",
  "DRAFT_NOT_RETRYABLE",
  "RETRY_METADATA_MISMATCH",
  "DRAFT_SUPERSEDED",
  "CANCELLATION_FORBIDDEN",
]);

export const readServerCuratedMessage = (payload: unknown): string | null => {
  const code = readErrorCode(payload);
  if (
    code === null ||
    !SERVER_CURATED_MESSAGE_CODES.has(code) ||
    !isRecord(payload)
  ) {
    return null;
  }
  const { message } = payload;
  return typeof message === "string" && message.trim() !== "" ? message : null;
};

const FORBIDDEN_ERROR_CODES: ReadonlySet<string> = new Set([
  "FORBIDDEN",
  "CSRF_REJECTED",
  "ACCESS_NOT_PROVISIONED",
]);

const isForbiddenFailure = (status: number, code: string | null): boolean =>
  status === 403 || (code !== null && FORBIDDEN_ERROR_CODES.has(code));

const curatedMessageOf = (
  code: string | null,
  serverMessage: string | null
): string | null => {
  if (
    code === null ||
    serverMessage === null ||
    !SERVER_CURATED_MESSAGE_CODES.has(code)
  ) {
    return null;
  }
  return serverMessage.trim() === "" ? null : serverMessage;
};

export const resolveFailure = (
  status: number,
  code: string | null,
  serverMessage: string | null = null
): GenerationFailure => {
  if (status === 401 || code === "UNAUTHENTICATED") {
    return { unauthorized: true, message: "" };
  }

  if (status === 429 || code === "RATE_LIMITED") {
    return { unauthorized: false, message: ERROR_COPY.rateLimited };
  }

  if (status === 503 || code === "AUTH_UNAVAILABLE") {
    return { unauthorized: false, message: ERROR_COPY.unavailable };
  }

  const curated = curatedMessageOf(code, serverMessage);
  if (curated !== null) {
    return { unauthorized: false, message: curated };
  }

  return {
    unauthorized: false,
    message: isForbiddenFailure(status, code)
      ? ERROR_COPY.forbidden
      : ERROR_COPY.generic,
  };
};
