import {
  continueSessionProjectionSchema,
  csrfHeaderName,
  sessionProjectionSchema,
} from "@/shared/identity-contract";
import { isJsonObject, readResponseJson } from "@/lib/http";

import type {
  ContinueSessionProjection,
  SessionProjection,
} from "@/shared/identity-contract";

export const authBroadcastChannelName = "edu-canvas-auth";

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

const parseActiveProjection = (
  body: unknown
): ActiveSessionProjection | undefined => {
  if (!isJsonObject(body)) {
    return undefined;
  }
  const parsed = sessionProjectionSchema.safeParse({
    status: body.status,
    actor: body.actor,
    session: body.session,
  });
  return parsed.success && parsed.data.status === "active"
    ? parsed.data
    : undefined;
};

const toFailure = (response: Response, body: unknown): AuthApiFailure => {
  return {
    code:
      isJsonObject(body) && isAuthErrorCode(body.code) ? body.code : "UNKNOWN",
    status: response.status,
    message:
      isJsonObject(body) && typeof body.message === "string"
        ? body.message
        : "",
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

  const body =
    response.status === 204 ? undefined : await readResponseJson(response);
  return response.ok
    ? { ok: true, data: { body, response } }
    : { ok: false, error: toFailure(response, body) };
};

const jsonPost = async (
  path: string,
  csrf: string,
  payload: unknown
): Promise<AuthApiResult<RawResponse>> => {
  return await request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [csrfHeaderName]: csrf,
    },
    keepalive: true,
    body: JSON.stringify(payload),
  });
};

export const fetchAuthChallenge = async (): Promise<
  AuthApiResult<{ csrf: string }>
> => {
  const result = await request("/api/auth/context");
  if (!result.ok) {
    return result;
  }
  const { body } = result.data;
  return !isJsonObject(body) ||
    typeof body.csrf !== "string" ||
    body.csrf === ""
    ? { ok: false, error: contractFailure }
    : { ok: true, data: { csrf: body.csrf } };
};

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

export const submitSignUp = async (
  credentials: { readonly email: string; readonly password: string },
  csrf: string
): Promise<AuthApiResult<{ readonly email: string }>> => {
  const result = await jsonPost("/api/auth/sign-up", csrf, credentials);
  if (!result.ok) {
    return result;
  }
  const { body } = result.data;
  return isJsonObject(body) && typeof body.email === "string"
    ? { ok: true, data: { email: body.email } }
    : { ok: false, error: contractFailure };
};

export const submitMembership = async (
  membershipId: string,
  csrf: string
): Promise<AuthApiResult<ActiveSessionProjection>> => {
  const result = await jsonPost("/api/auth/membership", csrf, { membershipId });
  if (!result.ok) {
    return result;
  }
  const projection = parseActiveProjection(result.data.body);
  return projection
    ? { ok: true, data: projection }
    : { ok: false, error: contractFailure };
};

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
    isJsonObject(body) && typeof body.csrf === "string" ? body.csrf : null;
  const projection = parseActiveProjection(body);
  return projection
    ? { ok: true, data: { projection, csrf } }
    : { ok: false, error: contractFailure };
};

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

export const endSession = async (
  csrf: string
): Promise<AuthApiResult<null>> => {
  const result = await jsonPost("/api/auth/logout", csrf, {});
  return result.ok ? { ok: true, data: null } : result;
};

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

export const publishAuthSignal = (message: AuthBroadcastMessage): void => {
  if (typeof BroadcastChannel === "undefined") {
    return;
  }
  try {
    const channel = new BroadcastChannel(authBroadcastChannelName);
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
      if (!isJsonObject(data)) {
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
