/* eslint-disable no-inline-comments -- import-x requires an inline single-line chunk-name comment for dynamic imports. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseIdentityProvider } from "./supabase";

import type { IdentityProvider } from "./port";
import type { SupabaseProviderOptions } from "./supabase";

const projectUrl = "https://project.supabase.co";
const anonKey = "test-anon-key";
const serviceRoleKey = "test-service-role-key";
const teacherEmail = "teacher@example.com";
const teacherSecret = "correct-horse-battery-staple";
const userId = "provider-user-1";

const { anonClient, createClientMock, serviceRoleClient } = vi.hoisted(() => {
  return {
    anonClient: {
      auth: {
        admin: {
          signOut: vi.fn<(token: string, scope: string) => Promise<unknown>>(),
        },
        getUser: vi.fn<(token?: string) => Promise<unknown>>(),
        refreshSession:
          vi.fn<(session: { refresh_token: string }) => Promise<unknown>>(),
        signInWithPassword:
          vi.fn<
            (credentials: {
              email: string;
              password: string;
            }) => Promise<unknown>
          >(),
        signUp:
          vi.fn<
            (credentials: {
              email: string;
              password: string;
            }) => Promise<unknown>
          >(),
      },
    },
    createClientMock:
      vi.fn<(url: string, key: string, options: unknown) => unknown>(),
    serviceRoleClient: {
      auth: {
        admin: {
          signOut: vi.fn<(token: string, scope: string) => Promise<unknown>>(),
        },
      },
    },
  };
});

vi.mock(
  import(/* webpackChunkName: "supabase-js" */ "@supabase/supabase-js"),
  () => ({ createClient: createClientMock }) as never
);

const createApiError = (message: string, status: number, code: string): Error =>
  Object.assign(new Error(message), { code, status });

const createTransportError = (status: number): Error =>
  Object.assign(new Error("provider transport failure"), { status });

const createUser = (): Record<string, unknown> => {
  return {
    id: userId,
    email: teacherEmail,
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00.000Z",
  };
};

const createSession = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => {
  return {
    access_token: "access-token-value",
    refresh_token: "refresh-token-value",
    expires_at: 1_900_000_000,
    expires_in: 3600,
    token_type: "bearer",
    user: createUser(),
    ...overrides,
  };
};

const textEncoder = new TextEncoder();

const encodeSegment = (value: object): string => {
  const encoded = textEncoder.encode(JSON.stringify(value));
  return encoded.toBase64({ alphabet: "base64url", omitPadding: true });
};

const createToken = (claims: Record<string, unknown>): string => {
  return [
    encodeSegment({ alg: "HS256", typ: "JWT" }),
    encodeSegment(claims),
    "signature",
  ].join(".");
};

const hangingFetch: typeof fetch = (_input, init) => {
  const deferred = Promise.withResolvers<Response>();
  init?.signal?.addEventListener(
    "abort",
    () => {
      deferred.reject(new DOMException("Aborted", "TimeoutError"));
    },
    { once: true }
  );
  return deferred.promise;
};

const createProvider = (
  overrides?: Partial<SupabaseProviderOptions>
): IdentityProvider => {
  return createSupabaseIdentityProvider({
    url: projectUrl,
    anonKey,
    serviceRoleKey,
    timeoutMs: 200,
    ...overrides,
  });
};

describe("the Supabase identity provider adapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createClientMock.mockImplementation((_url: string, key: string) =>
      key === serviceRoleKey ? serviceRoleClient : anonClient
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates anon and service-role clients without session persistence", () => {
    createProvider();

    expect(createClientMock).toHaveBeenCalledTimes(2);
    expect(createClientMock).toHaveBeenNthCalledWith(
      1,
      projectUrl,
      anonKey,
      expect.objectContaining({
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        global: { fetch: expect.any(Function) },
      })
    );
    expect(createClientMock).toHaveBeenNthCalledWith(
      2,
      projectUrl,
      serviceRoleKey,
      expect.anything()
    );
  });

  it("defaults the issuer to the hosted auth endpoint and honors an override", () => {
    expect(createProvider().issuer).toBe(`${projectUrl}/auth/v1`);
    expect(createProvider({ issuer: "custom-issuer" }).issuer).toBe(
      "custom-issuer"
    );
  });

  it("maps a valid sign-in to an authenticated outcome without echoing the password", async () => {
    anonClient.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: createSession({ session_id: "provider-session-1" }),
        user: createUser(),
      },
      error: null,
    });
    const provider = createProvider();

    const outcome = await provider.signInWithPassword(
      teacherEmail,
      teacherSecret
    );

    expect(outcome).toStrictEqual({
      status: "authenticated",
      auth: {
        subject: userId,
        email: teacherEmail,
        emailVerified: true,
        providerSessionId: "provider-session-1",
        accessToken: "access-token-value",
        refreshToken: "refresh-token-value",
        expiresAt: 1_900_000_000,
      },
    });
    expect(anonClient.auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
      email: teacherEmail,
      password: teacherSecret,
    });
    expect(JSON.stringify(outcome)).not.toContain(teacherSecret);
  });

  it("maps invalid credentials to a rejected outcome", async () => {
    anonClient.auth.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: createApiError(
        "Invalid login credentials",
        400,
        "invalid_credentials"
      ),
    });
    const provider = createProvider();

    await expect(
      provider.signInWithPassword(teacherEmail, "wrong-password")
    ).resolves.toStrictEqual({ status: "rejected" });
  });

  it("maps an unconfirmed email to email-unverified", async () => {
    anonClient.auth.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: createApiError("Email not confirmed", 400, "email_not_confirmed"),
    });
    const provider = createProvider();

    await expect(
      provider.signInWithPassword(teacherEmail, teacherSecret)
    ).resolves.toStrictEqual({ status: "email-unverified" });
  });

  it("maps a provider timeout to unavailable", async () => {
    anonClient.auth.signInWithPassword.mockRejectedValue(
      createTransportError(0)
    );
    const provider = createProvider();

    await expect(
      provider.signInWithPassword(teacherEmail, teacherSecret)
    ).resolves.toStrictEqual({ status: "unavailable" });
  });

  it("maps a provider outage to unavailable", async () => {
    anonClient.auth.signInWithPassword.mockRejectedValue(
      createTransportError(503)
    );
    const provider = createProvider();

    await expect(
      provider.signInWithPassword(teacherEmail, teacherSecret)
    ).resolves.toStrictEqual({ status: "unavailable" });
  });

  it("falls back to the access-token session claim when the SDK exposes no session id", async () => {
    anonClient.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: createSession({
          access_token: createToken({ session_id: "jwt-session-id" }),
        }),
        user: createUser(),
      },
      error: null,
    });
    const provider = createProvider();

    const outcome = await provider.signInWithPassword(
      teacherEmail,
      teacherSecret
    );

    expect(outcome).toMatchObject({
      status: "authenticated",
      auth: { providerSessionId: "jwt-session-id" },
    });
  });

  it("falls back to the user id when the access token is opaque", async () => {
    anonClient.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: createSession({ access_token: "opaque-token" }),
        user: createUser(),
      },
      error: null,
    });
    const provider = createProvider();

    const outcome = await provider.signInWithPassword(
      teacherEmail,
      teacherSecret
    );

    expect(outcome).toMatchObject({
      status: "authenticated",
      auth: { providerSessionId: userId },
    });
  });

  it("returns verification-pending for a fresh sign-up", async () => {
    anonClient.auth.signUp.mockResolvedValue({
      data: { session: null, user: createUser() },
      error: null,
    });
    const provider = createProvider();

    await expect(
      provider.signUpTeacher(teacherEmail, teacherSecret)
    ).resolves.toStrictEqual({
      status: "verification-pending",
      email: teacherEmail,
    });
  });

  it("hides an already-registered address behind the same sign-up outcome", async () => {
    anonClient.auth.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: createApiError(
        "User already registered",
        422,
        "user_already_exists"
      ),
    });
    const provider = createProvider();

    await expect(
      provider.signUpTeacher(teacherEmail, teacherSecret)
    ).resolves.toStrictEqual({
      status: "verification-pending",
      email: teacherEmail,
    });
  });

  it("maps a sign-up transport failure to unavailable", async () => {
    anonClient.auth.signUp.mockRejectedValue(createTransportError(0));
    const provider = createProvider();

    await expect(
      provider.signUpTeacher(teacherEmail, teacherSecret)
    ).resolves.toStrictEqual({ status: "unavailable" });
  });

  it("returns refreshed credentials for a valid refresh token", async () => {
    anonClient.auth.refreshSession.mockResolvedValue({
      data: {
        session: createSession({ session_id: "provider-session-2" }),
        user: createUser(),
      },
      error: null,
    });
    const provider = createProvider();

    const outcome = await provider.refresh("current-refresh-token");

    expect(outcome).toMatchObject({
      status: "refreshed",
      auth: {
        subject: userId,
        accessToken: "access-token-value",
        providerSessionId: "provider-session-2",
      },
    });
    expect(anonClient.auth.refreshSession).toHaveBeenCalledExactlyOnceWith({
      refresh_token: "current-refresh-token",
    });
  });

  it("maps an invalid refresh token to invalid", async () => {
    anonClient.auth.refreshSession.mockResolvedValue({
      data: { session: null, user: null },
      error: createApiError(
        "Invalid Refresh Token: Refresh Token Not Found",
        400,
        "refresh_token_not_found"
      ),
    });
    const provider = createProvider();

    await expect(
      provider.refresh("stale-refresh-token")
    ).resolves.toStrictEqual({ status: "invalid" });
  });

  it("swallows provider errors on sign-out so local logout still succeeds", async () => {
    serviceRoleClient.auth.admin.signOut.mockRejectedValue(
      new Error("provider unreachable")
    );
    const provider = createProvider();

    await expect(
      provider.signOut("access-token-value")
    ).resolves.toBeUndefined();
    expect(
      serviceRoleClient.auth.admin.signOut
    ).toHaveBeenCalledExactlyOnceWith("access-token-value", "local");
    expect(anonClient.auth.admin.signOut).not.toHaveBeenCalled();
  });

  it("confirms an active provider session", async () => {
    anonClient.auth.getUser.mockResolvedValue({
      data: { user: createUser() },
      error: null,
    });
    const provider = createProvider();

    await expect(
      provider.verifySession(createToken({ sub: userId }))
    ).resolves.toStrictEqual({
      status: "active",
      subject: userId,
      emailVerified: true,
    });
    expect(anonClient.auth.getUser).toHaveBeenCalledExactlyOnceWith(
      expect.any(String)
    );
  });

  it("maps a rejected token to unauthorized", async () => {
    anonClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: createApiError("invalid JWT", 401, "bad_jwt"),
    });
    const provider = createProvider();

    await expect(
      provider.verifySession("invalid-token")
    ).resolves.toStrictEqual({ status: "unauthorized" });
  });

  it("maps a session-check transport failure to unavailable", async () => {
    anonClient.auth.getUser.mockRejectedValue(createTransportError(0));
    const provider = createProvider();

    await expect(provider.verifySession("some-token")).resolves.toStrictEqual({
      status: "unavailable",
    });
  });

  it("treats a token whose subject does not match the user as unauthorized", async () => {
    anonClient.auth.getUser.mockResolvedValue({
      data: { user: createUser() },
      error: null,
    });
    const provider = createProvider();

    await expect(
      provider.verifySession(createToken({ sub: "someone-else" }))
    ).resolves.toStrictEqual({ status: "unauthorized" });
  });

  it("aborts a hanging provider request at the configured timeout", async () => {
    vi.stubGlobal("fetch", hangingFetch);
    createProvider({ timeoutMs: 20 });

    const clientOptions = createClientMock.mock.calls[0]?.[2] as {
      global: { fetch: typeof fetch };
    };

    await expect(
      clientOptions.global.fetch(`${projectUrl}/auth/v1/token`, {})
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });
});
