import { z } from "zod";

import {
  membershipSelectionInputSchema,
  signInInputSchema,
  signUpInputSchema,
} from "@/shared/identity-contract";
import { readServerConfig } from "../config";
import { serverObservability } from "../observability.server";
import { createConfiguredIdentity } from "./composition.server";
import {
  createPreAuthChallenge,
  createSessionChallenge,
  isPreAuthChallengeValid,
  isSessionChallengeValid,
  isTrustedOrigin,
} from "./csrf";
import {
  csrfHeaderName,
  pendingAuthCookieName,
  sessionChallengeCookieName,
  sessionCookieName,
} from "./cookies";
import { IdentityError, isIdentityError } from "./errors";
import { projectActiveSession, projectMembershipRequired } from "./projection";

import type { ServerConfig } from "../config";
import type { IdentityService, SignInOutcome } from "./service";
import type { SessionResolution } from "./types";
import type { SessionProjection } from "@/shared/identity-contract";

const sessionMaxAgeSeconds = 8 * 60 * 60;

const noStore = { "cache-control": "no-store" } as const;

const jsonResponse = (
  payload: unknown,
  status = 200,
  headers: HeadersInit = {}
) => {
  return Response.json(payload, {
    status,
    headers: { ...noStore, ...headers },
  });
};

const errorResponse = (error: IdentityError) => {
  return jsonResponse(
    { code: error.code, message: error.message },
    error.status
  );
};

const toErrorResponse = (error: unknown): Response => {
  if (isIdentityError(error)) {
    return errorResponse(error);
  }
  if (error instanceof z.ZodError) {
    return errorResponse(new IdentityError("INVALID_INPUT"));
  }
  serverObservability.captureError(error, {
    operation: "identity.request",
    reason: "unexpected",
  });
  return errorResponse(new IdentityError("AUTH_UNAVAILABLE"));
};

const clearSiteDataValue =
  '"cache", "cookies", "storage", "executionContexts", "prefetchCache", "prerenderCache"';

interface CookieSpec {
  readonly name: string;
  readonly value: string;
}

const parseCookies = (request: Request): ReadonlyMap<string, string[]> => {
  const header = request.headers.get("cookie");
  const map = new Map<string, string[]>();
  if (!header) {
    return map;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    const existing = map.get(name) ?? [];
    existing.push(value);
    map.set(name, existing);
  }
  return map;
};

const singleCookie = (
  request: Request,
  name: string
): { value: string | undefined; duplicate: boolean } => {
  const parsed = parseCookies(request);
  const values = parsed.get(name) ?? [];
  return {
    value: values[0],
    duplicate: values.length > 1,
  };
};

const serializeCookie = (
  spec: CookieSpec,
  options: { maxAge: number; secure: boolean; clear?: boolean }
): string => {
  const attributes = [
    `${spec.name}=${options.clear ? "" : spec.value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.clear ? 0 : options.maxAge}`,
  ];
  if (options.secure) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
};

interface CookieNames {
  readonly session: string;
  readonly pending: string;
  readonly challenge: string;
}

const cookieNamesFor = (config: ServerConfig): CookieNames => {
  // `__Host-` requires a secure context; development runs on plain HTTP.
  if (config.appEnv === "development") {
    return {
      session: "edu_canvas_session",
      pending: "edu_canvas_pending",
      challenge: "edu_canvas_csrf",
    };
  }
  return {
    session: sessionCookieName,
    pending: pendingAuthCookieName,
    challenge: sessionChallengeCookieName,
  };
};

const sourceAddressFor = (request: Request): string =>
  request.headers.get("fly-client-ip")?.trim() || "unknown";

const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};

export interface AuthDependencies {
  readonly identity: IdentityService;
  readonly sessionSecret: string;
  readonly publicOrigin: string;
  readonly config: ServerConfig;
}

export const resolveAuthDependencies = async (
  config: ServerConfig = readServerConfig()
): Promise<AuthDependencies> => {
  const configured = await createConfiguredIdentity(config);
  return {
    identity: configured.service,
    sessionSecret: configured.sessionSecret,
    publicOrigin: configured.publicOrigin,
    config,
  };
};

const guardMutationOrigin = (
  request: Request,
  dependencies: AuthDependencies
): IdentityError | null => {
  return isTrustedOrigin(
    request.headers.get("origin"),
    dependencies.publicOrigin
  )
    ? null
    : new IdentityError("CSRF_REJECTED");
};

const guardPreAuthChallenge = (
  request: Request,
  dependencies: AuthDependencies
): IdentityError | null => {
  const { value } = singleCookie(
    request,
    cookieNamesFor(dependencies.config).challenge
  );
  const header = request.headers.get(csrfHeaderName);
  return isPreAuthChallengeValid(header, value)
    ? null
    : new IdentityError("CSRF_REJECTED");
};

const guardSessionChallenge = (
  request: Request,
  dependencies: AuthDependencies,
  sessionId: string
): IdentityError | null => {
  const header = request.headers.get(csrfHeaderName);
  return header &&
    isSessionChallengeValid(dependencies.sessionSecret, sessionId, header)
    ? null
    : new IdentityError("CSRF_REJECTED");
};

const challengeHeaders = (
  dependencies: AuthDependencies,
  token: string
): HeadersInit => {
  const names = cookieNamesFor(dependencies.config);
  return {
    "set-cookie": serializeCookie(
      { name: names.challenge, value: token },
      { maxAge: 600, secure: dependencies.config.appEnv !== "development" }
    ),
  };
};

const sessionCookieHeader = (
  dependencies: AuthDependencies,
  credential: string
): string => {
  const names = cookieNamesFor(dependencies.config);
  return serializeCookie(
    { name: names.session, value: credential },
    {
      maxAge: sessionMaxAgeSeconds,
      secure: dependencies.config.appEnv !== "development",
    }
  );
};

const pendingCookieHeader = (
  dependencies: AuthDependencies,
  credential: string
): string => {
  const names = cookieNamesFor(dependencies.config);
  return serializeCookie(
    { name: names.pending, value: credential },
    { maxAge: 300, secure: dependencies.config.appEnv !== "development" }
  );
};

const sessionCredential = (
  request: Request,
  dependencies: AuthDependencies
): { value: string | undefined; duplicate: boolean } =>
  singleCookie(request, cookieNamesFor(dependencies.config).session);

/**
GET /api/auth/context — establishes the pre-auth flow; no account data.
*/
export const handleAuthContext = (
  _request: Request,
  dependencies: AuthDependencies
): Promise<Response> => {
  const token = createPreAuthChallenge();
  return Promise.resolve(
    jsonResponse({ csrf: token }, 200, challengeHeaders(dependencies, token))
  );
};

/**
POST /api/auth/sign-up — teacher sign-up; identical state for duplicates.
*/
export const handleSignUp = async (
  request: Request,
  dependencies: AuthDependencies
): Promise<Response> => {
  const originError = guardMutationOrigin(request, dependencies);
  if (originError) {
    return errorResponse(originError);
  }
  const challengeError = guardPreAuthChallenge(request, dependencies);
  if (challengeError) {
    return errorResponse(challengeError);
  }

  const parsed = signUpInputSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return errorResponse(new IdentityError("INVALID_INPUT"));
  }

  try {
    const outcome = await dependencies.identity.signUpTeacher({
      email: parsed.data.email,
      password: parsed.data.password,
      sourceAddress: sourceAddressFor(request),
    });
    return jsonResponse({
      status: outcome.status,
      email: outcome.email,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
};

const projectSignInOutcome = (
  dependencies: AuthDependencies,
  outcome: SignInOutcome
): Response => {
  if (outcome.status === "membership-required") {
    return jsonResponse(
      projectMembershipRequired(outcome.memberships, outcome.expiresAt),
      200,
      {
        "set-cookie": pendingCookieHeader(
          dependencies,
          outcome.pendingCredential
        ),
      }
    );
  }

  return jsonResponse(
    projectActiveSession({
      role: outcome.actor.role,
      displayName: outcome.actor.displayName,
      tenantId: outcome.actor.tenantId,
      tenantName: outcome.actor.tenantName,
      sessionGeneration: outcome.actor.sessionGeneration,
      idleExpiresAt: outcome.session.lastActivityAt,
      absoluteExpiresAt: outcome.session.absoluteExpiresAt,
    }),
    200,
    { "set-cookie": sessionCookieHeader(dependencies, outcome.credential) }
  );
};

/**
POST /api/auth/sign-in
*/
export const handleSignIn = async (
  request: Request,
  dependencies: AuthDependencies
): Promise<Response> => {
  const originError = guardMutationOrigin(request, dependencies);
  if (originError) {
    return errorResponse(originError);
  }
  const challengeError = guardPreAuthChallenge(request, dependencies);
  if (challengeError) {
    return errorResponse(challengeError);
  }

  const parsed = signInInputSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return errorResponse(new IdentityError("INVALID_INPUT"));
  }

  try {
    const outcome = await dependencies.identity.signIn({
      email: parsed.data.email,
      password: parsed.data.password,
      sourceAddress: sourceAddressFor(request),
    });
    return projectSignInOutcome(dependencies, outcome);
  } catch (error) {
    return toErrorResponse(error);
  }
};

/**
POST /api/auth/membership — consume pending authority, rotate the credential.
*/
export const handleMembership = async (
  request: Request,
  dependencies: AuthDependencies
): Promise<Response> => {
  const originError = guardMutationOrigin(request, dependencies);
  if (originError) {
    return errorResponse(originError);
  }
  const challengeError = guardPreAuthChallenge(request, dependencies);
  if (challengeError) {
    return errorResponse(challengeError);
  }

  const parsed = membershipSelectionInputSchema.safeParse(
    await readJson(request)
  );
  if (!parsed.success) {
    return errorResponse(new IdentityError("INVALID_INPUT"));
  }

  const { value: pendingCredential } = singleCookie(
    request,
    cookieNamesFor(dependencies.config).pending
  );
  if (!pendingCredential) {
    return errorResponse(new IdentityError("UNAUTHENTICATED"));
  }

  try {
    const outcome = await dependencies.identity.selectMembership({
      pendingCredential,
      membershipId: parsed.data.membershipId,
      sourceAddress: sourceAddressFor(request),
    });
    const names = cookieNamesFor(dependencies.config);
    return jsonResponse(
      projectActiveSession({
        role: outcome.actor.role,
        displayName: outcome.actor.displayName,
        tenantId: outcome.actor.tenantId,
        tenantName: outcome.actor.tenantName,
        sessionGeneration: outcome.actor.sessionGeneration,
        idleExpiresAt: outcome.session.lastActivityAt,
        absoluteExpiresAt: outcome.session.absoluteExpiresAt,
      }),
      200,
      {
        "set-cookie": [
          sessionCookieHeader(dependencies, outcome.credential),
          serializeCookie(
            { name: names.pending, value: "" },
            {
              maxAge: 0,
              secure: dependencies.config.appEnv !== "development",
              clear: true,
            }
          ),
        ].join(", "),
      }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
};

/**
GET /api/auth/session — safe projection; no idle renewal.
*/
export const handleSession = async (
  request: Request,
  dependencies: AuthDependencies
): Promise<Response> => {
  const { value: credential, duplicate } = sessionCredential(
    request,
    dependencies
  );
  if (duplicate) {
    return errorResponse(new IdentityError("UNAUTHENTICATED"));
  }

  const resolution = await dependencies.identity.resolveSession(credential);
  if (resolution.status === "unavailable") {
    return errorResponse(new IdentityError("AUTH_UNAVAILABLE"));
  }
  if (resolution.status === "unauthenticated") {
    return errorResponse(new IdentityError("UNAUTHENTICATED"));
  }

  const idleExpiry = new Date(
    Date.parse(resolution.session.lastActivityAt) + 30 * 60 * 1000
  );
  const projection: SessionProjection = projectActiveSession({
    role: resolution.actor.role,
    displayName: resolution.actor.displayName,
    tenantId: resolution.actor.tenantId,
    tenantName: resolution.actor.tenantName,
    sessionGeneration: resolution.actor.sessionGeneration,
    idleExpiresAt: idleExpiry.toISOString(),
    absoluteExpiresAt: resolution.session.absoluteExpiresAt,
  });

  const challenge = createSessionChallenge(
    dependencies.sessionSecret,
    resolution.session.sessionId
  );
  return jsonResponse(
    { ...projection, csrf: challenge },
    200,
    challengeHeaders(dependencies, challenge)
  );
};

/**
POST /api/auth/continue — the only action that renews idle time.
*/
export const handleContinue = async (
  request: Request,
  dependencies: AuthDependencies
): Promise<Response> => {
  const originError = guardMutationOrigin(request, dependencies);
  if (originError) {
    return errorResponse(originError);
  }

  const { value: credential, duplicate } = sessionCredential(
    request,
    dependencies
  );
  if (duplicate || !credential) {
    return errorResponse(new IdentityError("UNAUTHENTICATED"));
  }

  const resolution = await dependencies.identity.resolveSession(credential);
  if (resolution.status === "unavailable") {
    return errorResponse(new IdentityError("AUTH_UNAVAILABLE"));
  }
  if (resolution.status === "unauthenticated") {
    return errorResponse(new IdentityError("UNAUTHENTICATED"));
  }

  const challengeError = guardSessionChallenge(
    request,
    dependencies,
    resolution.session.sessionId
  );
  if (challengeError) {
    return errorResponse(challengeError);
  }

  const outcome = await dependencies.identity.continueSession(credential);
  if (!outcome) {
    return errorResponse(new IdentityError("UNAUTHENTICATED"));
  }
  return jsonResponse({
    status: "active",
    idleExpiresAt: outcome.idleExpiresAt,
    absoluteExpiresAt: outcome.absoluteExpiresAt,
  });
};

/**
 * POST /api/auth/logout — local revocation first, then best-effort provider sign-out. Tolerates a missing credential. Accepts no target session id.
 */
export const handleLogout = async (
  request: Request,
  dependencies: AuthDependencies
): Promise<Response> => {
  const originError = guardMutationOrigin(request, dependencies);
  if (originError) {
    return errorResponse(originError);
  }

  const { value: credential, duplicate } = sessionCredential(
    request,
    dependencies
  );
  if (duplicate) {
    return errorResponse(new IdentityError("UNAUTHENTICATED"));
  }

  const names = cookieNamesFor(dependencies.config);
  const clearedCookies = [
    serializeCookie(
      { name: names.session, value: "" },
      {
        maxAge: 0,
        secure: dependencies.config.appEnv !== "development",
        clear: true,
      }
    ),
    serializeCookie(
      { name: names.challenge, value: "" },
      {
        maxAge: 0,
        secure: dependencies.config.appEnv !== "development",
        clear: true,
      }
    ),
  ].join(", ");

  const outcome = await dependencies.identity.endSession(credential);
  const headers = {
    "clear-site-data": clearSiteDataValue,
    "set-cookie": clearedCookies,
  };

  if (outcome.status === "durable-failure") {
    return jsonResponse(
      {
        code: "AUTH_UNAVAILABLE",
        message: "Sign-out could not be confirmed. Reload the page.",
      },
      503,
      headers
    );
  }

  return new Response(null, { status: 204, headers });
};

/**
 * Resolve the caller's session for a protected delivery seam. Duplicate session
 * cookies are rejected outright (AT-25).
 */
export const resolveRequestSession = (
  request: Request,
  dependencies: AuthDependencies
): Promise<SessionResolution> => {
  const { value: credential, duplicate } = sessionCredential(
    request,
    dependencies
  );
  return duplicate
    ? Promise.resolve({ status: "unauthenticated" })
    : dependencies.identity.resolveSession(credential);
};

/**
 * Protected mutations require an exact trusted origin and a session-bound
 * forgery token before any credential work (PC-02, AT-15, AT-17).
 */
export const guardProtectedMutation = (
  request: Request,
  dependencies: AuthDependencies,
  sessionId: string
): IdentityError | null => {
  const originError = guardMutationOrigin(request, dependencies);
  return originError ?? guardSessionChallenge(request, dependencies, sessionId);
};

export const identityErrorJson = (error: IdentityError): Response =>
  errorResponse(error);

/**
Resolve the composition or return a fail-closed 503 response.
*/
export const resolveAuthOrError = async (): Promise<
  | { readonly ok: true; readonly dependencies: AuthDependencies }
  | { readonly ok: false; readonly response: Response }
> => {
  const config = readServerConfig();
  if (config.issues.length > 0) {
    return {
      ok: false,
      response: identityErrorJson(new IdentityError("AUTH_UNAVAILABLE")),
    };
  }
  try {
    return { ok: true, dependencies: await resolveAuthDependencies(config) };
  } catch {
    return {
      ok: false,
      response: identityErrorJson(new IdentityError("AUTH_UNAVAILABLE")),
    };
  }
};
