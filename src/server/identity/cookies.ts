import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const credentialBytes = 32;
const sessionGenerationBytes = 16;

/**
Cookie names that cannot collide with the retired demo cookies.
*/
export const sessionCookieName = "__Host-edu_canvas_session";
export const pendingAuthCookieName = "__Host-edu_canvas_pending";
export const sessionChallengeCookieName = "__Host-edu_canvas_csrf";

/**
Header a browser echoes back with a protected mutation's challenge.
*/
export const csrfHeaderName = "x-edu-canvas-csrf";

const encode = (bytes: Uint8Array): string =>
  bytes.toBase64({ alphabet: "base64url", omitPadding: true });

/**
 * Mint a fresh opaque credential with at least 256 bits of cryptographic randomness. The raw value is handed to the browser once; only its one-way verifier is persisted.
 */
export const createOpaqueCredential = (): string =>
  encode(randomBytes(credentialBytes));

/**
A non-secret session generation used to key client caches and drop stale results.
*/
export const createSessionGeneration = (): string =>
  encode(randomBytes(sessionGenerationBytes));

/**
One-way verifier for a reusable credential. Never persist the raw value.
*/
export const hashCredential = (credential: string): string =>
  createHash("sha256").update(credential).digest("hex");

export const isVerifierMatch = (
  credential: string,
  verifierHash: string
): boolean => {
  const computed = Buffer.from(hashCredential(credential), "utf-8");
  const expected = Buffer.from(verifierHash, "utf-8");
  return (
    computed.length === expected.length && timingSafeEqual(computed, expected)
  );
};
