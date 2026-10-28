import {
  continueSessionProjectionSchema,
  sessionProjectionSchema,
} from "@/shared/identity-contract";

import type {
  ContinueSessionProjection,
  SessionProjection,
} from "@/shared/identity-contract";

/**
Header a browser echoes back with a protected mutation's challenge.
*/
export const csrfHeaderName = "x-edu-canvas-csrf";

/**
Channel every tab listens on so a sign-out or expiry hides private UI.
*/
export const authBroadcastChannelName = "edu-canvas-auth";

/**
Same-tab, in-memory store for the short-lived pending memberships after sign-in. It is never written to any browser storage: the pending authority itself lives in an HttpOnly cookie, and these labels only drive the choice screen for the tab that just signed in. The value lives in a mutable holder so this module keeps the single source of truth without reassigning a top-level binding.
*/
const pendingMembershipHandoff: { current: PendingMembershipHandoff | null } = {
  current: null,
};

export const authErrorCodes = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "CSRF_REJECTED",
  "AUTH_UNAVAILABLE",
  "ACCESS_NOT_PROVISIONED",
  "RATE_LIMITED",
  "INVALID_INPUT",
] as const;

export type AuthErrorCode = (typeof authErrorCodes)[number];

export interface AuthApiFailure {
  readonly code: AuthErrorCode | "UNKNOWN";
  readonly status: number;
  readonly message: string;
}

export type AuthApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: AuthApiFailure };

export type ActiveSessionProjection = Extract<
  SessionProjection,
  { status: "active" }
>;

export interface MembershipOption {
  readonly membershipId: string;
  readonly tenantName: string;
  readonly role: "teacher" | "student";
}

export interface PendingMembershipHandoff {
  readonly csrf: string;
  readonly memberships: readonly MembershipOption[];
  readonly expiresAt: string;
}

export interface AuthBroadcastMessage {
  readonly type: "signed-out" | "expired";
  readonly generation: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isAuthErrorCode = (value: unknown): value is AuthErrorCode => {
  return (
    typeof value === "string" &&
    (authErrorCodes as readonly string[]).includes(value)
  );
};

const networkFailure: AuthApiFailure = {
  code: "AUTH_UNAVAILABLE",
  status: 0,
  message: "",
};

const contractFailure: AuthApiFailure = {
  code: "UNKNOWN",
  status: 200,
  message: "",
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const toFailure = (response: Response, body: unknown): AuthApiFailure => {
  return {
    code: isRecord(body) && isAuthErrorCode(body.code) ? body.code : "UNKNOWN",
    status: response.status,
    message:
      isRecord(body) && typeof body.message === "string" ? body.message : "",
  };
};

interface RawResponse {
  readonly body: unknown;
  readonly response: Response;
}

const request = async (
  path: string,
  init: RequestInit = {}
): Promise<AuthApiResult<RawResponse>> => {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "same-origin", ...init });
  } catch {
    return { ok: false, error: networkFailure };
  }

  const body = response.status === 204 ? undefined : await readJson(response);
  return response.ok
    ? { ok: true, data: { body, response } }
    : { ok: false, error: toFailure(response, body) };
};

const jsonPost = (
  path: string,
  csrf: string,
  payload: unknown
): Promise<AuthApiResult<RawResponse>> => {
  return request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [csrfHeaderName]: csrf,
    },
    body: JSON.stringify(payload),
  });
};

/**
GET /api/auth/context — mint the pre-auth challenge before any mutation.
*/
export const fetchAuthChallenge = async (): Promise<
  AuthApiResult<{ csrf: string }>
> => {
  const result = await request("/api/auth/context");
  if (!result.ok) {
    return result;
  }
  const { body } = result.data;
  return !isRecord(body) || typeof body.csrf !== "string" || body.csrf === ""
    ? { ok: false, error: contractFailure }
    : { ok: true, data: { csrf: body.csrf } };
};

/**
POST /api/auth/sign-in — active projection, or a membership choice.
*/
export const submitSignIn = async (
  credentials: { readonly email: string; readonly password: string },
  csrf: string
): Promise<AuthApiResult<SessionProjection>> => {
  const result = await jsonPost("/api/auth/sign-in", csrf, credentials);
  if (!result.ok) {
    return result;
  }
  const parsed = sessionProjectionSchema.safeParse(result.data.body);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: contractFailure };
};

/**
POST /api/auth/sign-up — always verification-pending, new or duplicate.
*/
export const submitSignUp = async (
  credentials: { readonly email: string; readonly password: string },
  csrf: string
): Promise<AuthApiResult<{ readonly email: string }>> => {
  const result = await jsonPost("/api/auth/sign-up", csrf, credentials);
  if (!result.ok) {
    return result;
  }
  const { body } = result.data;
  return isRecord(body) && typeof body.email === "string"
    ? { ok: true, data: { email: body.email } }
    : { ok: false, error: contractFailure };
};

/**
POST /api/auth/membership — consume the pending credential for one school.
*/
export const submitMembership = async (
  membershipId: string,
  csrf: string
): Promise<AuthApiResult<ActiveSessionProjection>> => {
  const result = await jsonPost("/api/auth/membership", csrf, { membershipId });
  if (!result.ok) {
    return result;
  }
  // The envelope carries no extra keys, but select the three known branches so
  // a future addition cannot fail a strict parse.
  const { body } = result.data;
  const parsed = isRecord(body)
    ? sessionProjectionSchema.safeParse({
        status: body.status,
        actor: body.actor,
        session: body.session,
      })
    : undefined;
  return parsed?.success && parsed.data.status === "active"
    ? { ok: true, data: parsed.data }
    : { ok: false, error: contractFailure };
};

/**
GET /api/auth/session — safe projection plus a session-bound CSRF token.
*/
export const fetchSession = async (): Promise<
  AuthApiResult<{
    readonly projection: ActiveSessionProjection;
    readonly csrf: string | null;
  }>
> => {
  const result = await request("/api/auth/session");
  if (!result.ok) {
    return result;
  }
  const { body } = result.data;
  const csrf =
    isRecord(body) && typeof body.csrf === "string" ? body.csrf : null;
  const parsed = isRecord(body)
    ? sessionProjectionSchema.safeParse({
        status: body.status,
        actor: body.actor,
        session: body.session,
      })
    : undefined;
  return parsed?.success && parsed.data.status === "active"
    ? { ok: true, data: { projection: parsed.data, csrf } }
    : { ok: false, error: contractFailure };
};

/**
POST /api/auth/continue — the only call that renews idle time.
*/
export const renewSession = async (
  csrf: string
): Promise<AuthApiResult<ContinueSessionProjection>> => {
  const result = await jsonPost("/api/auth/continue", csrf, {});
  if (!result.ok) {
    return result;
  }
  const parsed = continueSessionProjectionSchema.safeParse(result.data.body);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: contractFailure };
};

/**
POST /api/auth/logout — revoke locally, then clear site data.
*/
export const endSession = async (
  csrf: string
): Promise<AuthApiResult<null>> => {
  const result = await jsonPost("/api/auth/logout", csrf, {});
  return result.ok ? { ok: true, data: null } : result;
};

// Hand the chosen-school list to /login/membership through tab memory only.
export const readPendingMembershipHandoff = ():
  PendingMembershipHandoff | undefined =>
  pendingMembershipHandoff.current ?? undefined;

export const writePendingMembershipHandoff = (
  handoff: PendingMembershipHandoff
): void => {
  pendingMembershipHandoff.current = handoff;
};

export const clearPendingMembershipHandoff = (): void => {
  pendingMembershipHandoff.current = null;
};

const noCleanup = (): void => {
  // Nothing was subscribed or scheduled, so there is nothing to release.
};

// Best-effort cross-tab signal; an absent BroadcastChannel is not a failure.
export const publishAuthSignal = (message: AuthBroadcastMessage): void => {
  if (typeof BroadcastChannel === "undefined") {
    return;
  }
  try {
    const channel = new BroadcastChannel(authBroadcastChannelName);
    // BroadcastChannel has no origin concept: the value travels only to this
    // origin's other tabs, so a targetOrigin argument does not exist.
    // eslint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel takes no targetOrigin.
    channel.postMessage(message);
    channel.close();
  } catch {
    // A blocked channel must never break sign-out.
  }
};

export const subscribeToAuthSignals = (
  listener: (message: AuthBroadcastMessage) => void
): (() => void) => {
  if (typeof BroadcastChannel === "undefined") {
    return noCleanup;
  }
  try {
    const channel = new BroadcastChannel(authBroadcastChannelName);
    const handleMessage = (event: MessageEvent<unknown>): void => {
      const { data } = event;
      if (!isRecord(data)) {
        return;
      }
      if (data.type !== "signed-out" && data.type !== "expired") {
        return;
      }
      listener({
        type: data.type,
        generation:
          typeof data.generation === "string" ? data.generation : null,
      });
    };
    channel.addEventListener("message", handleMessage);
    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
    };
  } catch {
    return noCleanup;
  }
};
