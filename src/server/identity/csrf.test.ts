import { describe, expect, it } from "vitest";

import {
  createPreAuthChallenge,
  createSessionChallenge,
  isPreAuthChallengeValid,
  isSessionChallengeValid,
  isTrustedOrigin,
} from "./csrf";

describe("origin trust", () => {
  it("accepts only the exact configured origin", () => {
    expect(
      isTrustedOrigin("https://app.example.com", "https://app.example.com")
    ).toBeTruthy();
    expect(
      isTrustedOrigin(
        "https://app.example.com.evil.test",
        "https://app.example.com"
      )
    ).toBeFalsy();
    expect(
      isTrustedOrigin("http://app.example.com", "https://app.example.com")
    ).toBeFalsy();
    expect(isTrustedOrigin(null, "https://app.example.com")).toBeFalsy();
  });
});

describe("pre-authentication challenge", () => {
  it("matches only the identical challenge value", () => {
    const challenge = createPreAuthChallenge();

    expect(isPreAuthChallengeValid(challenge, challenge)).toBeTruthy();
    expect(
      isPreAuthChallengeValid(createPreAuthChallenge(), challenge)
    ).toBeFalsy();
    expect(isPreAuthChallengeValid(null, challenge)).toBeFalsy();
    expect(isPreAuthChallengeValid(challenge, undefined)).toBeFalsy();
  });

  it("issues distinct challenge values", () => {
    const values = new Set(
      Array.from({ length: 50 }, () => createPreAuthChallenge())
    );

    expect(values.size).toBe(50);
  });
});

describe("session challenge", () => {
  it("binds the token to one session", () => {
    const secret = "a-session-secret-value-that-is-long-enough";
    const token = createSessionChallenge(secret, "session-one");

    expect(isSessionChallengeValid(secret, "session-one", token)).toBeTruthy();
    expect(isSessionChallengeValid(secret, "session-two", token)).toBeFalsy();
    expect(
      isSessionChallengeValid(
        "another-secret-value-long-enough-01",
        "session-one",
        token
      )
    ).toBeFalsy();
  });
});
