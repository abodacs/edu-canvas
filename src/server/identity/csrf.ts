import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const challengeBytes = 24;

const encode = (bytes: Uint8Array): string =>
  bytes.toBase64({ alphabet: "base64url", omitPadding: true });

/**
A fresh pre-authentication challenge value, bound to a same-browser cookie.
*/
export const createPreAuthChallenge = (): string =>
  encode(randomBytes(challengeBytes));

const areEqualBytes = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "utf-8");
  const rightBuffer = Buffer.from(right, "utf-8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

/**
 * A session-bound forgery token. Recomputable from the session id and the server secret, so it is stateless and cannot be reused for another session.
 */
export const createSessionChallenge = (
  secret: string,
  sessionId: string
): string => {
  return createHmac("sha256", secret)
    .update(`session:${sessionId}`)
    .digest("base64url");
};

export const isSessionChallengeValid = (
  secret: string,
  sessionId: string,
  provided: string
): boolean =>
  areEqualBytes(createSessionChallenge(secret, sessionId), provided);

/**
 * Validate the configured public origin exactly. Arbitrary forwarded headers
 * are never trusted; the browser's `Origin` must equal the configured origin.
 */
export const isTrustedOrigin = (
  origin: string | null,
  configuredOrigin: string
): boolean => origin !== null && origin === configuredOrigin;

export const isPreAuthChallengeValid = (
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean => {
  return Boolean(
    provided &&
    expected &&
    provided.length > 0 &&
    areEqualBytes(provided, expected)
  );
};
