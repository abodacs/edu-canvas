import { createHash, randomBytes } from "node:crypto";

const credentialBytes = 32;
const sessionGenerationBytes = 16;

export const sessionCookieName = "__Host-edu_canvas_session";
export const pendingAuthCookieName = "__Host-edu_canvas_pending";
export const sessionChallengeCookieName = "__Host-edu_canvas_csrf";

const encode = (bytes: Uint8Array): string =>
  bytes.toBase64({ alphabet: "base64url", omitPadding: true });

export const createOpaqueCredential = (): string =>
  encode(randomBytes(credentialBytes));

export const createSessionGeneration = (): string =>
  encode(randomBytes(sessionGenerationBytes));

export const hashCredential = (credential: string): string =>
  createHash("sha256").update(credential).digest("hex");
