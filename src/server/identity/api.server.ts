import { z } from "zod";

import {
  csrfHeaderName,
  membershipSelectionInputSchema,
  signInInputSchema,
  signUpInputSchema,
} from "@/shared/identity-contract";
import { readServerConfig } from "../config";
import { noStoreJson, readJsonBody, responseWithCookies } from "../http.server";
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
  pendingAuthCookieName,
  sessionChallengeCookieName,
  sessionCookieName,
} from "./cookies";
import { IdentityError, isIdentityError } from "./errors";
import {
  idleExpiryFrom,
  projectActiveSession,
  projectMembershipRequired,
} from "./projection";

import type { ConfiguredIdentity } from "./composition.server";
import type { ServerConfig } from "../config";
import type { IdentityService, SignInOutcome } from "./service";
import type { LearnerActor, SessionResolution, TeacherActor } from "./types";
import type { SessionProjection } from "@/shared/identity-contract";

const sessionMaxAgeSeconds = 8 * 60 * 60;

const errorResponse = (error: IdentityError) => {
  return noStoreJson(
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
  if (header === null || header === "") {
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
    `${spec.name}=${options.clear === true ? "" : spec.value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.clear === true ? 0 : options.maxAge}`,
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

const sourceAddressFor = (request: Request): string => {
  const source = request.headers.get("fly-client-ip")?.trim();
  return source === undefined || source === "" ? "unknown" : source;
};

export interface AuthDependencies {
  readonly identity: IdentityService;
  readonly sessionSecret: string;
  readonly publicOrigin: string;
  readonly config: ServerConfig;
}

export type TeacherResolution =
  | {
      readonly ok: true;
      readonly actor: TeacherActor;
      readonly sessionId: string;
      readonly dependencies: AuthDependencies;
    }
  | { readonly ok: false; readonly error: IdentityError };

export type LearnerResolution =
  | {
      readonly ok: true;
      readonly actor: LearnerActor;
      readonly sessionId: string;
      readonly dependencies: AuthDependencies;
    }
  | { readonly ok: false; readonly error: IdentityError };

export const authDependenciesFrom = (
  config: ServerConfig,
  configured: ConfiguredIdentity
): AuthDependencies => {
  return {
    identity: configured.service,
    sessionSecret: configured.sessionSecret,
    publicOrigin: configured.publicOrigin,
    config,
  };
};

export const resolveAuthDependencies = async (
  config: ServerConfig = readServerConfig()
): Promise<AuthDependencies> =>
  authDependenciesFrom(config, await createConfiguredIdentity(config));

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
  return header !== null &&
    header !== "" &&
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

export const handleAuthContext = async (
  _request: Request,
  dependencies: AuthDependencies
): Promise<Response> => {
  const token = createPreAuthChallenge();
  return await Promise.resolve(
    noStoreJson({ csrf: token }, 200, challengeHeaders(dependencies, token))
  );
};

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

  const parsed = signUpInputSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return errorResponse(new IdentityError("INVALID_INPUT"));
  }

  try {
    const outcome = await dependencies.identity.signUpTeacher({
      email: parsed.data.email,
      password: parsed.data.password,
      sourceAddress: sourceAddressFor(request),
    });
    return noStoreJson({
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
    return noStoreJson(
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

  return noStoreJson(
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

  const parsed = signInInputSchema.safeParse(await readJsonBody(request));
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
    await readJsonBody(request)
  );
  if (!parsed.success) {
    return errorResponse(new IdentityError("INVALID_INPUT"));
  }

  const { value: pendingCredential } = singleCookie(
    request,
    cookieNamesFor(dependencies.config).pending
  );
  if (pendingCredential === undefined || pendingCredential === "") {
    return errorResponse(new IdentityError("UNAUTHENTICATED"));
  }

  try {
    const outcome = await dependencies.identity.selectMembership({
      pendingCredential,
      membershipId: parsed.data.membershipId,
      sourceAddress: sourceAddressFor(request),
    });
    const names = cookieNamesFor(dependencies.config);
    return responseWithCookies(
      projectActiveSession({
        role: outcome.actor.role,
        displayName: outcome.actor.displayName,
        tenantId: outcome.actor.tenantId,
        tenantName: outcome.actor.tenantName,
        sessionGeneration: outcome.actor.sessionGeneration,
        idleExpiresAt: outcome.session.lastActivityAt,
        absoluteExpiresAt: outcome.session.absoluteExpiresAt,
      }),
      [
        sessionCookieHeader(dependencies, outcome.credential),
        serializeCookie(
          { name: names.pending, value: "" },
          {
            maxAge: 0,
            secure: dependencies.config.appEnv !== "development",
            clear: true,
          }
        ),
      ],
      200
    );
  } catch (error) {
    return toErrorResponse(error);
  }
};

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

  const idleDeadline = new Date(
    idleExpiryFrom(resolution.session.lastActivityAt)
  );
  const projection: SessionProjection = projectActiveSession({
    role: resolution.actor.role,
    displayName: resolution.actor.displayName,
    tenantId: resolution.actor.tenantId,
    tenantName: resolution.actor.tenantName,
    sessionGeneration: resolution.actor.sessionGeneration,
    idleExpiresAt: idleDeadline.toISOString(),
    absoluteExpiresAt: resolution.session.absoluteExpiresAt,
  });

  const challenge = createSessionChallenge(
    dependencies.sessionSecret,
    resolution.session.sessionId
  );
  return noStoreJson(
    { ...projection, csrf: challenge },
    200,
    challengeHeaders(dependencies, challenge)
  );
};

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
  if (duplicate || credential === undefined || credential === "") {
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
  return noStoreJson({
    status: "active",
    idleExpiresAt: outcome.idleExpiresAt,
    absoluteExpiresAt: outcome.absoluteExpiresAt,
  });
};

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
  ];

  const outcome = await dependencies.identity.endSession(credential);
  const headers = { "clear-site-data": clearSiteDataValue };

  if (outcome.status === "durable-failure") {
    return responseWithCookies(
      {
        code: "AUTH_UNAVAILABLE",
        message: "Sign-out could not be confirmed. Reload the page.",
      },
      clearedCookies,
      503,
      headers
    );
  }

  return responseWithCookies(null, clearedCookies, 204, headers);
};

export const resolveRequestSession = async (
  request: Request,
  dependencies: AuthDependencies
): Promise<SessionResolution> => {
  const { value: credential, duplicate } = sessionCredential(
    request,
    dependencies
  );
  return duplicate
    ? await Promise.resolve({ status: "unauthenticated" })
    : await dependencies.identity.resolveSession(credential);
};

export const guardProtectedMutation = (
  request: Request,
  dependencies: AuthDependencies,
  sessionId: string
): IdentityError | null => {
  const originError = guardMutationOrigin(request, dependencies);
  return originError ?? guardSessionChallenge(request, dependencies, sessionId);
};

export const resolveTeacherSession = async (
  request: Request,
  dependencies: AuthDependencies
): Promise<TeacherResolution> => {
  const resolution = await resolveRequestSession(request, dependencies);
  if (resolution.status === "unavailable") {
    return { ok: false, error: new IdentityError("AUTH_UNAVAILABLE") };
  }
  if (resolution.status === "unauthenticated") {
    return { ok: false, error: new IdentityError("UNAUTHENTICATED") };
  }
  if (resolution.actor.role !== "teacher") {
    return { ok: false, error: new IdentityError("FORBIDDEN") };
  }

  return {
    ok: true,
    actor: resolution.actor,
    sessionId: resolution.session.sessionId,
    dependencies,
  };
};

export const resolveTeacherActor = async (
  request: Request,
  config: ServerConfig = readServerConfig()
): Promise<TeacherResolution> => {
  if (config.issues.length > 0) {
    return { ok: false, error: new IdentityError("AUTH_UNAVAILABLE") };
  }

  let dependencies: AuthDependencies;
  try {
    dependencies = await resolveAuthDependencies(config);
  } catch {
    return { ok: false, error: new IdentityError("AUTH_UNAVAILABLE") };
  }

  return await resolveTeacherSession(request, dependencies);
};

export const resolveLearnerSession = async (
  request: Request,
  dependencies: AuthDependencies
): Promise<LearnerResolution> => {
  const resolution = await resolveRequestSession(request, dependencies);
  if (resolution.status === "unavailable") {
    return { ok: false, error: new IdentityError("AUTH_UNAVAILABLE") };
  }
  if (resolution.status === "unauthenticated") {
    return { ok: false, error: new IdentityError("UNAUTHENTICATED") };
  }
  if (resolution.actor.role !== "student") {
    return { ok: false, error: new IdentityError("FORBIDDEN") };
  }

  return {
    ok: true,
    actor: resolution.actor,
    sessionId: resolution.session.sessionId,
    dependencies,
  };
};

export const resolveLearnerActor = async (
  request: Request,
  config: ServerConfig = readServerConfig()
): Promise<LearnerResolution> => {
  if (config.issues.length > 0) {
    return { ok: false, error: new IdentityError("AUTH_UNAVAILABLE") };
  }

  let dependencies: AuthDependencies;
  try {
    dependencies = await resolveAuthDependencies(config);
  } catch {
    return { ok: false, error: new IdentityError("AUTH_UNAVAILABLE") };
  }

  return await resolveLearnerSession(request, dependencies);
};

export const identityErrorJson = (error: IdentityError): Response =>
  errorResponse(error);

export const resolveProtectedTeacher = async (
  request: Request,
  config: ServerConfig = readServerConfig()
): Promise<
  { ok: true; actor: TeacherActor } | { ok: false; response: Response }
> => {
  const resolved = await resolveTeacherActor(request, config);
  if (!resolved.ok) {
    return { ok: false, response: identityErrorJson(resolved.error) };
  }

  const guard = guardProtectedMutation(
    request,
    resolved.dependencies,
    resolved.sessionId
  );
  return guard
    ? { ok: false, response: identityErrorJson(guard) }
    : { ok: true, actor: resolved.actor };
};

export const resolveProtectedLearner = async (
  request: Request,
  config: ServerConfig = readServerConfig()
): Promise<
  { ok: true; actor: LearnerActor } | { ok: false; response: Response }
> => {
  const resolved = await resolveLearnerActor(request, config);
  if (!resolved.ok) {
    return { ok: false, response: identityErrorJson(resolved.error) };
  }

  const guard = guardProtectedMutation(
    request,
    resolved.dependencies,
    resolved.sessionId
  );
  return guard
    ? { ok: false, response: identityErrorJson(guard) }
    : { ok: true, actor: resolved.actor };
};
export const resolveAuthOrError = async (): Promise<
  | { readonly ok: true; readonly dependencies: AuthDependencies }
  | { readonly ok: false; readonly response: Response }
> => {
  const config = readServerConfig();
  if (config.issues.length > 0) {
    console.error("[auth] config issues", config.issues);
    return {
      ok: false,
      response: identityErrorJson(new IdentityError("AUTH_UNAVAILABLE")),
    };
  }
  try {
    return { ok: true, dependencies: await resolveAuthDependencies(config) };
  } catch (error) {
    console.error("[auth] dependency resolution failed", error);
    return {
      ok: false,
      response: identityErrorJson(new IdentityError("AUTH_UNAVAILABLE")),
    };
  }
};

export const authRoute = (
  handler: (
    request: Request,
    dependencies: AuthDependencies
  ) => Promise<Response>
): ((context: { readonly request: Request }) => Promise<Response>) => {
  return async ({ request }) => {
    const resolved = await resolveAuthOrError();
    return resolved.ok
      ? await handler(request, resolved.dependencies)
      : resolved.response;
  };
};
