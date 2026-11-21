import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const challengeBytes = 24;

const encode = (bytes: Uint8Array): string =>
  bytes.toBase64({ alphabet: "base64url", omitPadding: true });

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

export const isTrustedOrigin = (
  origin: string | null,
  configuredOrigin: string
): boolean => origin !== null && origin === configuredOrigin;

export const isPreAuthChallengeValid = (
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean =>
  provided !== undefined &&
  provided !== null &&
  provided !== "" &&
  expected !== undefined &&
  expected !== null &&
  expected !== "" &&
  provided.length > 0 &&
  areEqualBytes(provided, expected);
