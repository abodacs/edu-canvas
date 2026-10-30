import { createClient } from "@supabase/supabase-js";
import { parseProviderSubject } from "../identifiers";
import type { Session, User } from "@supabase/supabase-js";

import type {
  IdentityProvider,
  ProviderAuthResult,
  ProviderRefreshOutcome,
  ProviderSessionStatus,
  ProviderSignInOutcome,
  ProviderSignUpOutcome,
} from "./port";

export interface SupabaseProviderOptions {
  readonly url: string;
  readonly anonKey: string;
  readonly serviceRoleKey: string;
  readonly issuer?: string;
  readonly timeoutMs?: number;
}

const defaultTimeoutMs = 5000;

/**
 * Provider codes that mean the submitted password did not match the account.
 */
const credentialRejectionCodes = new Set([
  "invalid_credentials",
  "user_not_found",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readUnknownField = (value: unknown, key: string): unknown =>
  isRecord(value) ? value[key] : undefined;

/**
 * Composes a fresh `AbortSignal.timeout` into the fetch the SDK uses, so every
 * request fails closed once `timeoutMs` elapses. The GoTrue client issues
 * exactly one request per auth call, so this bounds the total provider call.
 */
const createTimeoutFetch = (timeoutMs: number): typeof fetch => {
  return (input, init) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;
    return fetch(input, { ...init, signal });
  };
};

interface ProviderErrorDetails {
  readonly code?: string;
  readonly status?: number;
}

const readErrorDetails = (error: unknown): ProviderErrorDetails => {
  const code = readUnknownField(error, "code");
  const status = readUnknownField(error, "status");
  return {
    ...(typeof code === "string" && { code }),
    ...(typeof status === "number" && { status }),
  };
};

/**
 * A transport failure is anything the provider never answered for: a network
 * error or timeout (status 0), an error with no HTTP status, or a 5xx outage.
 * These fail closed as `unavailable` rather than as a credential rejection.
 */
const isTransportFailure = (error: unknown): boolean => {
  const { status } = readErrorDetails(error);
  return status === undefined || status === 0 || status >= 500;
};

const textDecoder = new TextDecoder();

const decodeClaims = (payload: string): Record<string, unknown> | undefined => {
  const decoded: unknown = JSON.parse(
    textDecoder.decode(
      Uint8Array.fromBase64(payload, { alphabet: "base64url" })
    )
  );
  return isRecord(decoded) ? decoded : undefined;
};

/**
 * Reads JWT claims without verifying the signature. This is only for
 * non-security-critical fields (session id, subject consistency); authority
 * always comes from the provider's own `getUser`/`signIn` responses.
 */
const readTokenClaims = (
  accessToken: string
): Record<string, unknown> | undefined => {
  const segments = accessToken.split(".");
  const [, payload] = segments;
  if (!payload || segments.length !== 3) {
    return undefined;
  }
  try {
    return decodeClaims(payload);
  } catch {
    return undefined;
  }
};

const readClaim = (
  claims: Record<string, unknown> | undefined,
  key: string
): string | undefined => {
  const value = readUnknownField(claims, key);
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const readProviderSessionId = (
  session: Session,
  accessToken: string
): string => {
  const exposed = readUnknownField(session, "session_id");
  return typeof exposed === "string" && exposed.length > 0
    ? exposed
    : (readClaim(readTokenClaims(accessToken), "session_id") ??
        session.user.id);
};

const toAuthResult = (
  user: User,
  session: Session,
  fallbackEmail?: string
): ProviderAuthResult => {
  return {
    subject: parseProviderSubject(user.id),
    email: user.email ?? fallbackEmail ?? "",
    emailVerified: Boolean(user.email_confirmed_at),
    providerSessionId: readProviderSessionId(session, session.access_token),
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt:
      session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
  };
};

const classifySignInFailure = (error: unknown): ProviderSignInOutcome => {
  if (isTransportFailure(error)) {
    return { status: "unavailable" };
  }
  const { code } = readErrorDetails(error);
  if (code === "email_not_confirmed") {
    return { status: "email-unverified" };
  }
  // Unrecognized provider answers stay indeterminate and never disclose
  // whether an account exists.
  return {
    status:
      code !== undefined && credentialRejectionCodes.has(code)
        ? "rejected"
        : "unavailable",
  };
};

const classifyRefreshFailure = (error: unknown): ProviderRefreshOutcome => {
  const status = isTransportFailure(error) ? "unavailable" : "invalid";
  return { status };
};

const classifySessionFailure = (error: unknown): ProviderSessionStatus => {
  const status = isTransportFailure(error) ? "unavailable" : "unauthorized";
  return { status };
};

const stripTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;

/**
 * The hosted identity provider. An anon-key client performs every end-user
 * flow (sign-in, sign-up, refresh, get-user); a service-role client is used
 * only to revoke one provider session on sign-out. Passwords are transient
 * request data and never leave the method calls that receive them.
 */
export const createSupabaseIdentityProvider = (
  options: SupabaseProviderOptions
): IdentityProvider => {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const issuer = options.issuer ?? `${stripTrailingSlash(options.url)}/auth/v1`;
  const clientOptions = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { fetch: createTimeoutFetch(timeoutMs) },
  };

  const anonClient = createClient(options.url, options.anonKey, clientOptions);
  const serviceRoleClient = createClient(
    options.url,
    options.serviceRoleKey,
    clientOptions
  );

  const attemptSignIn = async (
    email: string,
    password: string
  ): Promise<ProviderSignInOutcome> => {
    const { data, error } = await anonClient.auth.signInWithPassword({
      email,
      password,
    });
    return error
      ? classifySignInFailure(error)
      : {
          status: "authenticated",
          auth: toAuthResult(data.user, data.session, email),
        };
  };

  const attemptSignUp = async (
    email: string,
    password: string
  ): Promise<ProviderSignUpOutcome> => {
    const { error } = await anonClient.auth.signUp({ email, password });
    // A fresh address and an already-registered one share one outcome so
    // sign-up never reveals whether the address exists (AT-37).
    return error && isTransportFailure(error)
      ? { status: "unavailable" }
      : { status: "verification-pending", email };
  };

  const attemptRefresh = async (
    refreshToken: string
  ): Promise<ProviderRefreshOutcome> => {
    const { data, error } = await anonClient.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error) {
      return classifyRefreshFailure(error);
    }
    const { user, session } = data;
    return user && session
      ? { status: "refreshed", auth: toAuthResult(user, session) }
      : { status: "invalid" };
  };

  const attemptVerify = async (
    accessToken: string
  ): Promise<ProviderSessionStatus> => {
    const { data, error } = await anonClient.auth.getUser(accessToken);
    if (error) {
      return classifySessionFailure(error);
    }
    const { user } = data;
    const tokenSubject = readClaim(readTokenClaims(accessToken), "sub");
    const isSubjectMismatch =
      tokenSubject !== undefined && tokenSubject !== user.id;
    return isSubjectMismatch
      ? { status: "unauthorized" }
      : {
          status: "active",
          subject: parseProviderSubject(user.id),
          emailVerified: Boolean(user.email_confirmed_at),
        };
  };

  return {
    issuer,
    signInWithPassword: async (
      email,
      password
    ): Promise<ProviderSignInOutcome> => {
      try {
        return await attemptSignIn(email, password);
      } catch (error) {
        return classifySignInFailure(error);
      }
    },
    signUpTeacher: async (email, password): Promise<ProviderSignUpOutcome> => {
      try {
        return await attemptSignUp(email, password);
      } catch (error) {
        return isTransportFailure(error)
          ? { status: "unavailable" }
          : { status: "verification-pending", email };
      }
    },
    refresh: async (refreshToken): Promise<ProviderRefreshOutcome> => {
      try {
        return await attemptRefresh(refreshToken);
      } catch (error) {
        return classifyRefreshFailure(error);
      }
    },
    signOut: async (accessToken): Promise<void> => {
      try {
        // Best effort, this session only. Local logout must still succeed.
        await serviceRoleClient.auth.admin.signOut(accessToken, "local");
      } catch {
        // Provider revocation is never allowed to block logout.
      }
    },
    verifySession: async (accessToken): Promise<ProviderSessionStatus> => {
      try {
        return await attemptVerify(accessToken);
      } catch (error) {
        return classifySessionFailure(error);
      }
    },
  };
};
