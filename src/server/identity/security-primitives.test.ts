import { describe, expect, it } from "vitest";

import { createCredentialCipher } from "./cipher";
import {
  createOpaqueCredential,
  createSessionGeneration,
  hashCredential,
  isVerifierMatch,
} from "./cookies";
import { createRateLimiter, normalizedAccountDigest } from "./rate-limit";

const keyOne = Uint8Array.from({ length: 32 }, () => 1).toBase64();
const keyTwo = Uint8Array.from({ length: 32 }, () => 2).toBase64();

describe("credential cipher", () => {
  it("round-trips credentials with authenticated encryption", () => {
    const cipher = createCredentialCipher({
      keyVersion: "1",
      keys: { "1": keyOne },
    });
    const plaintext = JSON.stringify({ accessToken: "a", refreshToken: "b" });
    const ciphertext = cipher.encrypt(plaintext);

    expect(ciphertext.startsWith("1:")).toBeTruthy();
    expect(ciphertext).not.toContain('a"');
    expect(cipher.decrypt(ciphertext)).toBe(plaintext);
  });

  it("detects tampering", () => {
    const cipher = createCredentialCipher({
      keyVersion: "1",
      keys: { "1": keyOne },
    });
    const ciphertext = cipher.encrypt("secret");
    const parts = ciphertext.split(":");
    const tampered = [parts[0], parts[1], parts[2], "AAAA"].join(":");

    expect(() => cipher.decrypt(tampered)).toThrow(
      "Unsupported state or unable to authenticate data"
    );
  });

  it("decrypts live sessions with the previous key during rotation", () => {
    const before = createCredentialCipher({
      keyVersion: "1",
      keys: { "1": keyOne },
    });
    const ciphertext = before.encrypt("rotating");

    const after = createCredentialCipher({
      keyVersion: "2",
      keys: { "1": keyOne, "2": keyTwo },
    });

    expect(after.decrypt(ciphertext)).toBe("rotating");
    expect(after.encrypt("fresh").startsWith("2:")).toBeTruthy();
  });

  it("invalidates ciphertext when the key is gone", () => {
    const before = createCredentialCipher({
      keyVersion: "1",
      keys: { "1": keyOne },
    });
    const ciphertext = before.encrypt("orphaned");
    const after = createCredentialCipher({
      keyVersion: "2",
      keys: { "2": keyTwo },
    });

    expect(() => after.decrypt(ciphertext)).toThrow(
      "No key is available for this ciphertext version."
    );
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => {
      return createCredentialCipher({
        keyVersion: "1",
        keys: { "1": Uint8Array.from({ length: 16 }, () => 1).toBase64() },
      });
    }).toThrow("Credential encryption key must decode to 32 bytes.");
  });
});

describe("opaque credentials", () => {
  it("mints at least 256 bits of randomness and unique values", () => {
    const values = new Set(
      Array.from({ length: 200 }, () => createOpaqueCredential())
    );

    expect(values.size).toBe(200);

    const [value = ""] = values;

    expect(
      Uint8Array.fromBase64(value, { alphabet: "base64url" }).length
    ).toBeGreaterThanOrEqual(32);
  });

  it("persists a one-way verifier that matches only the credential", () => {
    const credential = createOpaqueCredential();
    const verifier = hashCredential(credential);

    expect(verifier).not.toContain(credential);
    expect(isVerifierMatch(credential, verifier)).toBeTruthy();
    expect(isVerifierMatch(createOpaqueCredential(), verifier)).toBeFalsy();
  });

  it("mints a distinct non-secret session generation", () => {
    expect(createSessionGeneration()).not.toBe(createSessionGeneration());
  });
});

describe("rate limiter", () => {
  it("allows up to the limit inside the window and then rejects", () => {
    let clock = 1000;
    const limiter = createRateLimiter({ now: () => clock });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(limiter.consume("k", 3, 1000).allowed).toBeTruthy();
    }
    const denied = limiter.consume("k", 3, 1000);

    expect(denied.allowed).toBeFalsy();
    expect(denied.retryAfterMs).toBeGreaterThan(0);

    clock = 2000;

    expect(limiter.consume("k", 3, 1000).allowed).toBeTruthy();
  });

  it("keeps counters time-limited, never permanent", () => {
    let clock = 0;
    const limiter = createRateLimiter({ now: () => clock });

    expect(limiter.consume("k", 1, 100).allowed).toBeTruthy();
    expect(limiter.consume("k", 1, 100).allowed).toBeFalsy();

    clock = 100;

    expect(limiter.consume("k", 1, 100).allowed).toBeTruthy();
  });

  it("bounds the key space", () => {
    const limiter = createRateLimiter({ maxBuckets: 5, now: () => 0 });
    for (let index = 0; index < 20; index += 1) {
      limiter.consume(`key-${index}`, 10, 1000);
    }

    expect(limiter.consume("fresh", 10, 1000).allowed).toBeTruthy();
  });

  it("derives a stable, non-reversible account digest", () => {
    expect(normalizedAccountDigest("s", "User@Example.test")).toBe(
      normalizedAccountDigest("s", " user@example.test ")
    );
    expect(normalizedAccountDigest("s", "a@example.test")).not.toBe(
      normalizedAccountDigest("s", "b@example.test")
    );
  });
});
