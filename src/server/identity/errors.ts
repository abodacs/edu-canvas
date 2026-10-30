/**
 * Application error codes for the identity boundary. These are application codes, never vendor codes. Every code maps to one safe transport status and a message that never names another tenant's resource, owner, or existence.
 */
export const identityErrorCodeValues = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "CSRF_REJECTED",
  "AUTH_UNAVAILABLE",
  "ACCESS_NOT_PROVISIONED",
  "MEMBERSHIP_REQUIRED",
  "RATE_LIMITED",
  "INVALID_INPUT",
  "CONFLICT",
] as const;

export type IdentityErrorCode = (typeof identityErrorCodeValues)[number];

const statusByCode: Record<IdentityErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  CSRF_REJECTED: 403,
  AUTH_UNAVAILABLE: 503,
  ACCESS_NOT_PROVISIONED: 403,
  MEMBERSHIP_REQUIRED: 200,
  RATE_LIMITED: 429,
  INVALID_INPUT: 422,
  CONFLICT: 409,
};

const safeMessageByCode: Record<IdentityErrorCode, string> = {
  UNAUTHENTICATED: "Sign in to continue.",
  FORBIDDEN: "You do not have access to this resource.",
  CSRF_REJECTED:
    "This request could not be verified. Reload the page and try again.",
  AUTH_UNAVAILABLE:
    "Sign-in is temporarily unavailable. Try again in a moment.",
  ACCESS_NOT_PROVISIONED:
    "Contact your school administrator to finish setting up this account.",
  MEMBERSHIP_REQUIRED: "Choose a school to continue.",
  RATE_LIMITED: "Too many attempts. Wait a moment and try again.",
  INVALID_INPUT: "Check the details you entered and try again.",
  CONFLICT: "That change conflicts with an existing record.",
};

export const identityErrorStatus = (code: IdentityErrorCode): number =>
  statusByCode[code];

export const identityErrorSafeMessage = (code: IdentityErrorCode): string =>
  safeMessageByCode[code];

/**
 * The single error type the identity boundary throws. The message is always the safe message for the code, so a caller can serialize it without leaking server detail.
 */
export class IdentityError extends Error {
  readonly code: IdentityErrorCode;

  readonly status: number;

  constructor(code: IdentityErrorCode, options?: ErrorOptions) {
    super(safeMessageByCode[code], options);
    this.name = "IdentityError";
    this.code = code;
    this.status = statusByCode[code];
  }
}

export const isIdentityError = (value: unknown): value is IdentityError =>
  value instanceof IdentityError;
