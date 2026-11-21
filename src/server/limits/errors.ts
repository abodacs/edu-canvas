import { GenerationRequestError } from "../generation/generation-request-error";

const retrySeconds = (retryAfterMs: number): number =>
  Math.max(1, Math.ceil(retryAfterMs / 1000));

export const rateLimitedMessage = (retryAfterMs: number): string => {
  const seconds = retrySeconds(retryAfterMs);
  return `Too many generation requests right now. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
};

export class GenerationLimitError extends GenerationRequestError {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(rateLimitedMessage(retryAfterMs), {
      code: "RATE_LIMITED",
      retryAfterMs,
    });
    this.name = "GenerationLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}
