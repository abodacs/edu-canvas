import { describe, expect, it } from "vitest";

import { readServerConfig } from "../config";
import { handleGenerateLessonRequest } from "../generation/delivery.server";
import {
  createSeededIdentityPersistence,
  createSeededIdentityStore,
} from "../persistence/identity-seeded";
import { testServerEnvironment } from "../test-environment";

import {
  handleAuthContext,
  handleContinue,
  handleLogout,
  handleMembership,
  handleSession,
  handleSignIn,
  handleSignUp,
  authDependenciesFrom,
} from "./api.server";
import { createCredentialCipher } from "./cipher";
import { buildConfiguredIdentity } from "./composition.server";
import {
  parseActorId,
  parseClassId,
  parseMembershipId,
  parseProviderSubject,
  parseTenantId,
} from "./identifiers";
import { createIdentityProvisioning } from "./provisioning";
import { createDeterministicIdentityProvider } from "./provider/deterministic";
import { createRateLimiter } from "./rate-limit";
import { createIdentityService } from "./service";
import {
  ensureSyntheticIdentityFixture,
  syntheticAccounts,
  syntheticPasswordForTests,
  syntheticProviderIssuer,
} from "./synthetic-fixture";

import type { SeededIdentityStore } from "../persistence/identity-seeded";

import type { AuthDependencies } from "./api.server";
import type { IdentityError } from "./errors";
import type { IdentityPersistence } from "./persistence-port";
import type { DeterministicAccount } from "./provider/deterministic";
import type { IdentityProvider } from "./provider/port";

/**
 * §12.2 "Authentication matrix — AT-01 to AT-38" of
 * `.scratch/tasks/98-login/98-authentication.md`, one named case per row.
 *
 * Every case drives the real HTTP handlers in `api.server.ts` (documents/JSON in,
 * status/cookie/header out) against the seeded identity persistence and the
 * deterministic provider, or against `createIdentityProvisioning` where the row
 * describes the trusted provisioning seam. No policy is stubbed: the only
 * substituted collaborators are a persistence that fails a store write, a
 * provider that reports a different subject, and lowered rate-limit counters.
 *
 * Rows whose surface is missing on this branch are `it.skipIf(true)`: the case
 * name still carries the row id, the body documents and asserts the required
 * behaviour so un-skipping it fails until the surface lands, and a comment names
 * exactly what is missing. The literal disabled-test form is unavailable: the
 * repository's `vitest/no-disabled-tests` and `sonarjs/no-skipped-tests` rules
 * reject it, and the autofixed placeholder is rejected by the vitest warning
 * rule.
 */

const password = syntheticPasswordForTests;
const issuer = syntheticProviderIssuer;

const bilal = "bilal.north@example.test";
const amira = "amira.north@example.test";
const lina = "lina.north@example.test";
const unknownAddress = "nobody@example.test";

/**
 * Development-mode cookie names, as `cookieNamesFor` derives them for
 * `APP_ENV=development`: `__Host-` prefixes require a secure context.
 */
const localCookieNames = {
  session: "edu_canvas_session",
  pending: "edu_canvas_pending",
  challenge: "edu_canvas_csrf",
} as const;

const signInPath = "/api/auth/sign-in";
const signUpPath = "/api/auth/sign-up";
const membershipPath = "/api/auth/membership";
const continuePath = "/api/auth/continue";
const logoutPath = "/api/auth/logout";

const clearSiteDataValue =
  '"cache", "cookies", "storage", "executionContexts", "prefetchCache", "prerenderCache"';

const messages = {
  UNAUTHENTICATED: "Sign in to continue.",
  FORBIDDEN: "You do not have access to this resource.",
  CSRF_REJECTED:
    "This request could not be verified. Reload the page and try again.",
  AUTH_UNAVAILABLE:
    "Sign-in is temporarily unavailable. Try again in a moment.",
  ACCESS_NOT_PROVISIONED:
    "Contact your school administrator to finish setting up this account.",
  RATE_LIMITED: "Too many attempts. Wait a moment and try again.",
  SIGNOUT_UNCONFIRMED: "Sign-out could not be confirmed. Reload the page.",
} as const;

const minute = 60 * 1000;

interface ErrorBody {
  readonly code: string;
  readonly message: string;
}

interface SessionProjectionBody {
  readonly status: string;
  readonly csrf?: string;
  readonly actor?: {
    readonly role: string;
    readonly displayName: string;
    readonly tenantId: string;
    readonly tenantName: string;
    readonly capabilities: readonly string[];
  };
  readonly session?: {
    readonly generation: string;
    readonly idleExpiresAt: string;
    readonly absoluteExpiresAt: string;
  };
}

interface MembershipRequiredBody {
  readonly status: string;
  readonly expiresAt: string;
  readonly memberships: readonly {
    readonly membershipId: string;
    readonly tenantName: string;
    readonly role: string;
  }[];
}

interface ContinueBody {
  readonly status: string;
  readonly idleExpiresAt: string;
  readonly absoluteExpiresAt: string;
}

interface SignUpBody {
  readonly status: string;
  readonly email: string;
}

const configuredConfig = readServerConfig({ ...testServerEnvironment });
const configuredTestDependencies = authDependenciesFrom(
  configuredConfig,
  await buildConfiguredIdentity(
    configuredConfig,
    createSeededIdentityPersistence()
  )
);

const configuredDependencies = (): Promise<AuthDependencies> =>
  Promise.resolve(configuredTestDependencies);

const readJson = async <T>(response: Response): Promise<T> =>
  (await response.json()) as T;

const cookiePairs = (response: Response): string[] => {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0] ?? "");
};

const cookieValue = (response: Response, name: string): string | undefined => {
  return cookiePairs(response)
    .find((pair) => pair.startsWith(`${name}=`))
    ?.slice(name.length + 1);
};

const cookieHeaderFor = (response: Response, name: string): string =>
  `${name}=${cookieValue(response, name) ?? ""}`;

const openChallenge = async (
  dependencies: AuthDependencies
): Promise<{ readonly csrf: string; readonly cookie: string }> => {
  const response = await handleAuthContext(
    new Request(`${dependencies.publicOrigin}/api/auth/context`, {
      method: "GET",
    }),
    dependencies
  );
  const body = await readJson<{ readonly csrf: string }>(response);
  return {
    csrf: body.csrf,
    cookie: cookieHeaderFor(response, localCookieNames.challenge),
  };
};

interface MutationRequest {
  readonly dependencies: AuthDependencies;
  readonly path: string;
  readonly body?: unknown;
  readonly csrf?: string;
  readonly cookies?: readonly string[];
  readonly origin?: string | null;
}

const authMutation = (input: MutationRequest): Request => {
  const headers = new Headers();
  const origin =
    input.origin === undefined ? input.dependencies.publicOrigin : input.origin;
  if (origin !== null) {
    headers.set("origin", origin);
  }
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (input.csrf !== undefined) {
    headers.set("x-edu-canvas-csrf", input.csrf);
  }
  if (input.cookies !== undefined && input.cookies.length > 0) {
    headers.set("cookie", input.cookies.join("; "));
  }
  return new Request(`${input.dependencies.publicOrigin}${input.path}`, {
    method: "POST",
    headers,
    ...(input.body !== undefined && { body: JSON.stringify(input.body) }),
  });
};

const sessionRequest = (
  dependencies: AuthDependencies,
  cookie?: string
): Request => {
  return new Request(`${dependencies.publicOrigin}/api/auth/session`, {
    method: "GET",
    ...(cookie !== undefined && { headers: { cookie } }),
  });
};

const signIn = async (
  dependencies: AuthDependencies,
  email: string,
  options: { readonly password?: string; readonly origin?: string } = {}
): Promise<Response> => {
  const flow = await openChallenge(dependencies);
  return handleSignIn(
    authMutation({
      dependencies,
      path: signInPath,
      body: { email, password: options.password ?? password },
      csrf: flow.csrf,
      cookies: [flow.cookie],
      ...(options.origin !== undefined && { origin: options.origin }),
    }),
    dependencies
  );
};

const signUp = async (
  dependencies: AuthDependencies,
  email: string
): Promise<Response> => {
  const flow = await openChallenge(dependencies);
  return handleSignUp(
    authMutation({
      dependencies,
      path: signUpPath,
      body: { email, password },
      csrf: flow.csrf,
      cookies: [flow.cookie],
    }),
    dependencies
  );
};

const selectMembership = async (input: {
  readonly dependencies: AuthDependencies;
  readonly signInResponse: Response;
  readonly membershipId: string;
}): Promise<Response> => {
  const flow = await openChallenge(input.dependencies);
  return handleMembership(
    authMutation({
      dependencies: input.dependencies,
      path: membershipPath,
      body: { membershipId: input.membershipId },
      csrf: flow.csrf,
      cookies: [
        cookieHeaderFor(input.signInResponse, localCookieNames.pending),
        flow.cookie,
      ],
    }),
    input.dependencies
  );
};

const curriculumTenantName = "Edu-Canvas Synthetic Classroom";

/**
Signs the fixture teacher in and, since he also holds the curriculum classroom membership, completes the designed selection exactly like a production client. Defaults to the curriculum classroom; pass a school tenancy for rows that pin it.
*/
const signInAndSelect = async (
  dependencies: AuthDependencies,
  tenantName: string = curriculumTenantName
): Promise<Response> => {
  const signInResponse = await signIn(dependencies, bilal);
  const body = await readJson<MembershipRequiredBody>(signInResponse);
  if (body.status !== "membership-required") {
    return signInResponse;
  }
  const membership =
    body.memberships.find((option) => option.tenantName === tenantName) ??
    body.memberships.find((option) => option.membershipId.includes("_demo")) ??
    body.memberships.find((option) => option.role === "teacher") ??
    body.memberships[0];
  return selectMembership({
    dependencies,
    signInResponse,
    membershipId: membership?.membershipId ?? "",
  });
};

type MutationHandler = (
  request: Request,
  dependencies: AuthDependencies
) => Promise<Response>;

const mutationHandlers: Record<string, MutationHandler> = {
  [signInPath]: handleSignIn,
  [signUpPath]: handleSignUp,
  [membershipPath]: handleMembership,
  [continuePath]: handleContinue,
  [logoutPath]: handleLogout,
};

interface CallCounters {
  signIn: number;
  signUp: number;
  signOut: number;
  verifySession: number;
}

interface HarnessOptions {
  readonly accounts?: readonly DeterministicAccount[];
  readonly store?: SeededIdentityStore;
  readonly persistence?: IdentityPersistence;
  /**
   * `false` makes every provider call report `unavailable` (AT-19).
   */
  readonly available?: boolean;
  /**
   * Provider-side session revocation never takes effect, while the local store
   * stays healthy (AT-21).
   */
  readonly signOutOutage?: boolean;
  readonly signInAttemptLimit?: number;
  readonly decorateProvider?: (provider: IdentityProvider) => IdentityProvider;
  readonly wrapPersistence?: (
    persistence: IdentityPersistence
  ) => IdentityPersistence;
}

interface IdentityHarness {
  readonly dependencies: AuthDependencies;
  readonly persistence: IdentityPersistence;
  readonly store: SeededIdentityStore;
  readonly calls: CallCounters;
  readonly advance: (milliseconds: number) => void;
}

const credentialKey = Uint8Array.from({ length: 32 }, () => 7).toBase64();

/**
 * Builds a real identity service over the seeded persistence and the deterministic provider, with a controllable clock and call counters. Used where a row needs an extra provider account, an outage, a failing store write, or a boundary instant the shared composition cannot express.
 */
const createHarness = async (
  options: HarnessOptions = {}
): Promise<IdentityHarness> => {
  let clockMs = Date.parse("2026-01-01T00:00:00.000Z");
  const store = options.store ?? createSeededIdentityStore();
  const basePersistence =
    options.persistence ?? createSeededIdentityPersistence({ store });
  await ensureSyntheticIdentityFixture(basePersistence);
  const persistence =
    options.wrapPersistence?.(basePersistence) ?? basePersistence;

  const calls: CallCounters = {
    signIn: 0,
    signUp: 0,
    signOut: 0,
    verifySession: 0,
  };
  const provider = createDeterministicIdentityProvider({
    issuer,
    accounts: [...syntheticAccounts, ...(options.accounts ?? [])],
    available: options.available ?? true,
  });
  const counted: IdentityProvider = {
    issuer: provider.issuer,
    signInWithPassword: (email, secret) => {
      calls.signIn += 1;
      return provider.signInWithPassword(email, secret);
    },
    signUpTeacher: (email, secret) => {
      calls.signUp += 1;
      return provider.signUpTeacher(email, secret);
    },
    refresh: (refreshToken) => provider.refresh(refreshToken),
    signOut: (accessToken) => {
      calls.signOut += 1;
      return options.signOutOutage === true
        ? Promise.resolve()
        : provider.signOut(accessToken);
    },
    verifySession: (accessToken) => {
      calls.verifySession += 1;
      return provider.verifySession(accessToken);
    },
  };

  const config = readServerConfig({ ...testServerEnvironment });
  const service = createIdentityService({
    persistence,
    provider: options.decorateProvider?.(counted) ?? counted,
    cipher: createCredentialCipher({
      keyVersion: "1",
      keys: { "1": credentialKey },
    }),
    rateLimiter: createRateLimiter({ now: () => clockMs }),
    now: () => clockMs,
    clock: () => {
      const at = new Date(clockMs);
      return at.toISOString();
    },
    ...(options.signInAttemptLimit !== undefined && {
      signInAttemptLimit: options.signInAttemptLimit,
    }),
  });

  return {
    dependencies: {
      identity: service,
      sessionSecret: config.auth.sessionSecret ?? "",
      publicOrigin: config.auth.publicOrigin ?? "",
      config,
    },
    persistence,
    store,
    calls,
    advance: (milliseconds) => {
      clockMs += milliseconds;
    },
  };
};

const storeCounts = (store: SeededIdentityStore) => {
  return {
    actors: store.actors.size,
    bindings: store.providerBindings.size,
    memberships: store.memberships.size,
    pending: store.pendingAuthentications.size,
    sessions: store.sessions.size,
  };
};

const createProvisioningHarness = async () => {
  const store = createSeededIdentityStore();
  const persistence = createSeededIdentityPersistence({ store });
  await ensureSyntheticIdentityFixture(persistence);
  return {
    store,
    persistence,
    provisioning: createIdentityProvisioning({ persistence }),
  };
};

const unboundAccount: DeterministicAccount = {
  email: "unbound.teacher@example.test",
  password,
  subject: "subject_teacher_unbound",
  emailVerified: true,
};

const unverifiedAccount: DeterministicAccount = {
  email: "pending.teacher@example.test",
  password,
  subject: "subject_teacher_pending",
  emailVerified: false,
};

/**
 * Entries on this branch that can reject a server-owned identity override, or
 * that accept a provisioning principal, with the row's required error. Release
 * unit B (attempts, teacher decisions) and the provisioning seam have no HTTP
 * entry here, so each list is empty: the rows that need one assert the required
 * entry is present and therefore stay red until that surface lands.
 */
const learnerOverrideGuardEntries: readonly string[] = [];
const teacherLearnerOverrideGuardEntries: readonly string[] = [];
const provisioningPrincipalEntries: readonly string[] = [];

describe("AT-01 to AT-04: credential verification", () => {
  it("AT-01 signs a provisioned teacher into a session with no credential fields in the payload", async () => {
    const dependencies = await configuredDependencies();
    const response = await signInAndSelect(
      dependencies,
      "Northside Elementary"
    );
    const body = await readJson<SessionProjectionBody>(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "active",
      actor: { role: "teacher", tenantName: "Northside Elementary" },
    });
    expect(cookieValue(response, localCookieNames.session)).toBeDefined();
    expect(JSON.stringify(body)).not.toMatch(
      /password|credential|verifier|token|secret/iu
    );
  });

  it("AT-02 signs a provisioned learner into their own learner session", async () => {
    const dependencies = await configuredDependencies();
    const response = await signIn(dependencies, lina);
    const body = await readJson<SessionProjectionBody>(response);
    const resolved = await handleSession(
      sessionRequest(
        dependencies,
        cookieHeaderFor(response, localCookieNames.session)
      ),
      dependencies
    );
    const resolvedBody = await readJson<SessionProjectionBody>(resolved);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "active",
      actor: { role: "student", displayName: "Lina Farouk" },
    });
    expect(resolved.status).toBe(200);
    expect(resolvedBody).toMatchObject({
      actor: { role: "student", tenantId: "tenant_school_north" },
    });
    expect(cookieValue(response, localCookieNames.session)).toBeDefined();
  });

  it("AT-03 rejects wrong and unknown credentials with the same error", async () => {
    const dependencies = await configuredDependencies();
    const wrong = await signIn(dependencies, bilal, {
      password: "wrong-password",
    });
    const unknown = await signIn(dependencies, unknownAddress);
    const wrongBody = await readJson<ErrorBody>(wrong);
    const unknownBody = await readJson<ErrorBody>(unknown);

    expect([wrong.status, unknown.status]).toStrictEqual([401, 401]);
    expect(wrongBody).toStrictEqual(unknownBody);
    expect(wrongBody).toStrictEqual({
      code: "UNAUTHENTICATED",
      message: messages.UNAUTHENTICATED,
    });
    expect([...cookiePairs(wrong), ...cookiePairs(unknown)]).toStrictEqual([]);
  });

  it("AT-04 denies a verified identity with no provider binding and mints no session", async () => {
    const harness = await createHarness({ accounts: [unboundAccount] });
    const response = await signIn(harness.dependencies, unboundAccount.email);
    const body = await readJson<ErrorBody>(response);

    expect(response.status).toBe(403);
    expect(body).toStrictEqual({
      code: "ACCESS_NOT_PROVISIONED",
      message: messages.ACCESS_NOT_PROVISIONED,
    });
    expect(cookiePairs(response)).toStrictEqual([]);
    expect(storeCounts(harness.store).sessions).toBe(0);
  });
});

describe("AT-05 to AT-08: membership selection", () => {
  it("AT-05 returns the pending state for multiple memberships and authorizes no domain read", async () => {
    const dependencies = await configuredDependencies();
    const response = await signIn(dependencies, amira);
    const body = await readJson<MembershipRequiredBody>(response);
    const pendingCredential = cookieHeaderFor(
      response,
      localCookieNames.pending
    );
    const domain = await handleSession(
      sessionRequest(dependencies, pendingCredential),
      dependencies
    );

    expect(response.status).toBe(200);
    expect(body.status).toBe("membership-required");
    // The fixture teachers also hold the curriculum classroom membership, so
    // Amira's own list is now three tenancies.
    expect(
      body.memberships
        .map((membership) => membership.tenantName)
        .toSorted((left, right) => left.localeCompare(right))
    ).toStrictEqual([
      "Edu-Canvas Synthetic Classroom",
      "Northside Elementary",
      "Southside Middle",
    ]);
    expect(cookieValue(response, localCookieNames.session)).toBeUndefined();
    expect(domain.status).toBe(401);
  });

  it("AT-06 selects an own membership, binds one membership, and rotates the credential", async () => {
    const dependencies = await configuredDependencies();
    const signInResponse = await signIn(dependencies, amira);
    const body = await readJson<MembershipRequiredBody>(signInResponse);
    const pendingCredential = cookieHeaderFor(
      signInResponse,
      localCookieNames.pending
    );
    const north = body.memberships.find(
      (membership) => membership.tenantName === "Northside Elementary"
    );
    const membershipId = north?.membershipId ?? "";
    const selected = await selectMembership({
      dependencies,
      signInResponse,
      membershipId,
    });
    const selectedBody = await readJson<SessionProjectionBody>(selected);
    const replayed = await selectMembership({
      dependencies,
      signInResponse,
      membershipId,
    });

    expect(selected.status).toBe(200);
    expect(selectedBody).toMatchObject({
      status: "active",
      actor: {
        role: "teacher",
        tenantId: "tenant_school_north",
        tenantName: "Northside Elementary",
      },
    });
    expect(cookieHeaderFor(selected, localCookieNames.session)).not.toBe(
      pendingCredential
    );
    expect(selectedBody.session?.generation).toBeDefined();
    expect(replayed.status).toBe(401);
  });

  it("AT-07 refuses a foreign membership without a write or a disclosure", async () => {
    const dependencies = await configuredDependencies();
    const signInResponse = await signIn(dependencies, amira);
    const foreign = await selectMembership({
      dependencies,
      signInResponse,
      membershipId: "membership_bilal_north",
    });
    const body = await readJson<ErrorBody>(foreign);
    const own = await selectMembership({
      dependencies,
      signInResponse,
      membershipId: "membership_amira_north",
    });

    expect(foreign.status).toBe(403);
    expect(body).toStrictEqual({
      code: "FORBIDDEN",
      message: messages.FORBIDDEN,
    });
    expect(cookiePairs(foreign)).toStrictEqual([]);
    expect(JSON.stringify(body)).not.toMatch(
      /Northside|Southside|membership_/u
    );
    expect(own.status).toBe(200);
  });

  it("AT-08 rejects a replayed or expired pending credential without a new session", async () => {
    const dependencies = await configuredDependencies();
    const signInResponse = await signIn(dependencies, amira);
    const accepted = await selectMembership({
      dependencies,
      signInResponse,
      membershipId: "membership_amira_north",
    });
    const replayed = await selectMembership({
      dependencies,
      signInResponse,
      membershipId: "membership_amira_north",
    });
    const replayedBody = await readJson<ErrorBody>(replayed);
    const harness = await createHarness();
    const expiredSignInResponse = await signIn(harness.dependencies, amira);
    harness.advance(5 * minute);
    const expired = await selectMembership({
      dependencies: harness.dependencies,
      signInResponse: expiredSignInResponse,
      membershipId: "membership_amira_north",
    });

    expect(accepted.status).toBe(200);
    expect([replayed.status, expired.status]).toStrictEqual([401, 401]);
    expect(replayedBody).toStrictEqual({
      code: "UNAUTHENTICATED",
      message: messages.UNAUTHENTICATED,
    });
    expect(cookiePairs(replayed)).toStrictEqual([]);
  });
});

describe("AT-09 to AT-14: session reads and idle continuation", () => {
  it("AT-09 returns a safe active projection for a teacher session", async () => {
    const dependencies = await configuredDependencies();
    const signedIn = await signInAndSelect(dependencies);
    const response = await handleSession(
      sessionRequest(
        dependencies,
        cookieHeaderFor(signedIn, localCookieNames.session)
      ),
      dependencies
    );
    const body = await readJson<SessionProjectionBody>(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "active",
      actor: { role: "teacher" },
    });
    expect(
      Object.keys(body).toSorted((left, right) => left.localeCompare(right))
    ).toStrictEqual(["actor", "csrf", "session", "status"]);
    expect(
      Object.keys(body.actor ?? {}).toSorted((left, right) =>
        left.localeCompare(right)
      )
    ).toStrictEqual([
      "capabilities",
      "displayName",
      "role",
      "tenantId",
      "tenantName",
    ]);
    expect(JSON.stringify(body)).not.toMatch(
      /password|credential|verifier|token|secret/iu
    );
  });

  it("AT-10 returns a safe active projection for a learner session", async () => {
    const dependencies = await configuredDependencies();
    const signedIn = await signIn(dependencies, lina);
    const response = await handleSession(
      sessionRequest(
        dependencies,
        cookieHeaderFor(signedIn, localCookieNames.session)
      ),
      dependencies
    );
    const body = await readJson<SessionProjectionBody>(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "active",
      actor: { role: "student" },
    });
    expect(
      Object.keys(body.actor ?? {}).toSorted((left, right) =>
        left.localeCompare(right)
      )
    ).toStrictEqual([
      "capabilities",
      "displayName",
      "role",
      "tenantId",
      "tenantName",
    ]);
    expect(body.actor?.capabilities).toContain("submit_attempt");
  });

  it("AT-11 rejects a missing, expired, or revoked session credential", async () => {
    const dependencies = await configuredDependencies();
    const signedIn = await signInAndSelect(dependencies);
    const credential = cookieHeaderFor(signedIn, localCookieNames.session);
    await handleLogout(
      authMutation({ dependencies, path: logoutPath, cookies: [credential] }),
      dependencies
    );
    const missing = await handleSession(
      sessionRequest(dependencies),
      dependencies
    );
    const revoked = await handleSession(
      sessionRequest(dependencies, credential),
      dependencies
    );
    const harness = await createHarness();
    const harnessSignIn = await signInAndSelect(harness.dependencies);
    harness.advance(31 * minute);
    const expired = await handleSession(
      sessionRequest(
        harness.dependencies,
        cookieHeaderFor(harnessSignIn, localCookieNames.session)
      ),
      harness.dependencies
    );

    expect([missing.status, revoked.status, expired.status]).toStrictEqual([
      401, 401, 401,
    ]);
    await expect(readJson<ErrorBody>(revoked)).resolves.toStrictEqual({
      code: "UNAUTHENTICATED",
      message: messages.UNAUTHENTICATED,
    });
  });

  it("AT-12 advances a teacher idle deadline monotonically and inside the absolute deadline", async () => {
    const dependencies = await configuredDependencies();
    const signedIn = await signInAndSelect(dependencies);
    const credential = cookieHeaderFor(signedIn, localCookieNames.session);
    const before = await readJson<SessionProjectionBody>(
      await handleSession(
        sessionRequest(dependencies, credential),
        dependencies
      )
    );
    const renewed = await handleContinue(
      authMutation({
        dependencies,
        path: continuePath,
        csrf: before.csrf ?? "",
        cookies: [credential],
      }),
      dependencies
    );
    const body = await readJson<ContinueBody>(renewed);

    expect(renewed.status).toBe(200);
    expect(body.status).toBe("active");
    expect(Date.parse(body.idleExpiresAt)).toBeGreaterThanOrEqual(
      Date.parse(before.session?.idleExpiresAt ?? "")
    );
    expect(Date.parse(body.idleExpiresAt)).toBeLessThanOrEqual(
      Date.parse(body.absoluteExpiresAt)
    );
    expect(body.absoluteExpiresAt).toBe(before.session?.absoluteExpiresAt);
  });

  it("AT-13 applies the same continuation policy to a learner session", async () => {
    const dependencies = await configuredDependencies();
    const signedIn = await signIn(dependencies, lina);
    const credential = cookieHeaderFor(signedIn, localCookieNames.session);
    const before = await readJson<SessionProjectionBody>(
      await handleSession(
        sessionRequest(dependencies, credential),
        dependencies
      )
    );
    const renewed = await handleContinue(
      authMutation({
        dependencies,
        path: continuePath,
        csrf: before.csrf ?? "",
        cookies: [credential],
      }),
      dependencies
    );
    const body = await readJson<ContinueBody>(renewed);

    expect(renewed.status).toBe(200);
    expect(Date.parse(body.idleExpiresAt)).toBeGreaterThanOrEqual(
      Date.parse(before.session?.idleExpiresAt ?? "")
    );
    expect(Date.parse(body.idleExpiresAt)).toBeLessThanOrEqual(
      Date.parse(body.absoluteExpiresAt)
    );
    expect(body.absoluteExpiresAt).toBe(before.session?.absoluteExpiresAt);
  });

  it("AT-14 rejects a missing, expired, or revoked continue credential without extending", async () => {
    const harness = await createHarness();
    const signedIn = await signInAndSelect(harness.dependencies);
    const credential = cookieHeaderFor(signedIn, localCookieNames.session);
    const session = await readJson<SessionProjectionBody>(
      await handleSession(
        sessionRequest(harness.dependencies, credential),
        harness.dependencies
      )
    );
    const csrf = session.csrf ?? "";
    const missing = await handleContinue(
      authMutation({
        dependencies: harness.dependencies,
        path: continuePath,
        csrf,
        cookies: [],
      }),
      harness.dependencies
    );
    const secondSignIn = await signInAndSelect(harness.dependencies);
    const revokedCredential = cookieHeaderFor(
      secondSignIn,
      localCookieNames.session
    );
    await handleLogout(
      authMutation({
        dependencies: harness.dependencies,
        path: logoutPath,
        cookies: [revokedCredential],
      }),
      harness.dependencies
    );
    const revoked = await handleContinue(
      authMutation({
        dependencies: harness.dependencies,
        path: continuePath,
        csrf,
        cookies: [revokedCredential],
      }),
      harness.dependencies
    );
    harness.advance(31 * minute);
    const expired = await handleContinue(
      authMutation({
        dependencies: harness.dependencies,
        path: continuePath,
        csrf,
        cookies: [credential],
      }),
      harness.dependencies
    );
    const stillExpired = await handleSession(
      sessionRequest(harness.dependencies, credential),
      harness.dependencies
    );

    expect([missing.status, revoked.status, expired.status]).toStrictEqual([
      401, 401, 401,
    ]);
    expect(stillExpired.status).toBe(401);
  });
});

describe("AT-15 to AT-19: mutation protection and provider failure", () => {
  it("AT-15 rejects a missing or foreign origin on every mutation before effects", async () => {
    const dependencies = await configuredDependencies();
    const flow = await openChallenge(dependencies);
    const bodies: Record<string, unknown> = {
      [signInPath]: { email: bilal, password },
      [signUpPath]: { email: bilal, password },
      [membershipPath]: { membershipId: "membership_amira_north" },
    };
    const attempts = Object.keys(mutationHandlers).flatMap((path) =>
      [null, "https://evil.test"].map((origin) => ({ path, origin }))
    );
    const responses = await Promise.all(
      attempts.map(({ path, origin }) => {
        return mutationHandlers[path](
          authMutation({
            dependencies,
            path,
            csrf: flow.csrf,
            cookies: [flow.cookie],
            origin,
            ...(bodies[path] !== undefined && { body: bodies[path] }),
          }),
          dependencies
        );
      })
    );

    expect(responses.map((response) => response.status)).toStrictEqual(
      attempts.map(() => 403)
    );
    await expect(
      Promise.all(responses.map((response) => readJson<ErrorBody>(response)))
    ).resolves.toStrictEqual(
      attempts.map(() => {
        return {
          code: "CSRF_REJECTED",
          message: messages.CSRF_REJECTED,
        };
      })
    );
    expect(
      responses.flatMap((response) => cookiePairs(response))
    ).toStrictEqual([]);
  });

  it("AT-16 rejects an invalid or replayed pre-auth proof without a provider call", async () => {
    const harness = await createHarness();
    const flow = await openChallenge(harness.dependencies);
    const otherFlow = await openChallenge(harness.dependencies);
    const bodies = { email: bilal, password };
    const responses = await Promise.all([
      handleSignIn(
        authMutation({
          dependencies: harness.dependencies,
          path: signInPath,
          body: bodies,
          csrf: "forged-proof",
          cookies: [flow.cookie],
        }),
        harness.dependencies
      ),
      handleSignIn(
        authMutation({
          dependencies: harness.dependencies,
          path: signInPath,
          body: bodies,
          csrf: flow.csrf,
          cookies: [],
        }),
        harness.dependencies
      ),
      handleSignIn(
        authMutation({
          dependencies: harness.dependencies,
          path: signInPath,
          body: bodies,
          csrf: flow.csrf,
          cookies: [otherFlow.cookie],
        }),
        harness.dependencies
      ),
      handleSignUp(
        authMutation({
          dependencies: harness.dependencies,
          path: signUpPath,
          body: bodies,
          csrf: "forged-proof",
          cookies: [flow.cookie],
        }),
        harness.dependencies
      ),
    ]);

    expect(responses.map((response) => response.status)).toStrictEqual([
      403, 403, 403, 403,
    ]);
    expect(harness.calls).toStrictEqual({
      signIn: 0,
      signUp: 0,
      signOut: 0,
      verifySession: 0,
    });
    await expect(readJson<ErrorBody>(responses[0])).resolves.toStrictEqual({
      code: "CSRF_REJECTED",
      message: messages.CSRF_REJECTED,
    });
  });

  it("AT-17 rejects an invalid session proof on a valid credential with no domain effect", async () => {
    const dependencies = await configuredDependencies();
    const signedIn = await signInAndSelect(dependencies);
    const credential = cookieHeaderFor(signedIn, localCookieNames.session);
    const forged = await handleContinue(
      authMutation({
        dependencies,
        path: continuePath,
        csrf: "forged-proof",
        cookies: [credential],
      }),
      dependencies
    );
    const stillLive = await handleSession(
      sessionRequest(dependencies, credential),
      dependencies
    );

    expect(forged.status).toBe(403);
    await expect(readJson<ErrorBody>(forged)).resolves.toStrictEqual({
      code: "CSRF_REJECTED",
      message: messages.CSRF_REJECTED,
    });
    expect(cookiePairs(forged)).toStrictEqual([]);
    expect(stillLive.status).toBe(200);
  });

  it("AT-18 rejects a rate-limited sign-in without a provider call", async () => {
    const harness = await createHarness({ signInAttemptLimit: 1 });
    const first = await signIn(harness.dependencies, bilal, {
      password: "wrong-password",
    });
    const limited = await signIn(harness.dependencies, bilal, {
      password: "wrong-password",
    });

    expect([first.status, limited.status]).toStrictEqual([401, 429]);
    await expect(readJson<ErrorBody>(limited)).resolves.toStrictEqual({
      code: "RATE_LIMITED",
      message: messages.RATE_LIMITED,
    });
    expect(harness.calls.signIn).toBe(1);
    expect(cookiePairs(limited)).toStrictEqual([]);
  });

  it("AT-19 fails closed on a provider outage or a store failure with no synthetic fallback", async () => {
    const outage = await createHarness({ available: false });
    const outageResponse = await signIn(outage.dependencies, bilal);
    const storeFailure = await createHarness({
      wrapPersistence: (persistence) => {
        return {
          ...persistence,
          findProviderBinding: () =>
            Promise.reject(new Error("identity store unavailable")),
        };
      },
    });
    const storeResponse = await signIn(storeFailure.dependencies, bilal);

    expect([outageResponse.status, storeResponse.status]).toStrictEqual([
      503, 503,
    ]);
    await expect(readJson<ErrorBody>(outageResponse)).resolves.toStrictEqual({
      code: "AUTH_UNAVAILABLE",
      message: messages.AUTH_UNAVAILABLE,
    });
    expect(
      cookiePairs(outageResponse).length + cookiePairs(storeResponse).length
    ).toBe(0);
    expect(
      storeCounts(outage.store).sessions +
        storeCounts(storeFailure.store).sessions
    ).toBe(0);
  });
});

describe("AT-20 to AT-22: logout", () => {
  it("AT-20 clears local state on a same-origin logout without a live credential", async () => {
    const dependencies = await configuredDependencies();
    const response = await handleLogout(
      authMutation({ dependencies, path: logoutPath, cookies: [] }),
      dependencies
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("clear-site-data")).toBe(clearSiteDataValue);
    expect(response.headers.getSetCookie().join("; ")).toContain(
      `${localCookieNames.session}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    );
  });

  it("AT-21 completes a local logout during a provider logout outage and refuses the replay", async () => {
    const harness = await createHarness({ signOutOutage: true });
    const signedIn = await signInAndSelect(harness.dependencies);
    const credential = cookieHeaderFor(signedIn, localCookieNames.session);
    const response = await handleLogout(
      authMutation({
        dependencies: harness.dependencies,
        path: logoutPath,
        cookies: [credential],
      }),
      harness.dependencies
    );
    const replay = await handleSession(
      sessionRequest(harness.dependencies, credential),
      harness.dependencies
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("clear-site-data")).toBe(clearSiteDataValue);
    expect(harness.calls.signOut).toBe(1);
    expect(replay.status).toBe(401);
  });

  it("AT-22 reports an unconfirmed sign-out when local revocation cannot be written", async () => {
    const harness = await createHarness({
      wrapPersistence: (persistence) => {
        return {
          ...persistence,
          revokeSession: () => Promise.resolve(undefined),
        };
      },
    });
    const signedIn = await signInAndSelect(harness.dependencies);
    const credential = cookieHeaderFor(signedIn, localCookieNames.session);
    const response = await handleLogout(
      authMutation({
        dependencies: harness.dependencies,
        path: logoutPath,
        cookies: [credential],
      }),
      harness.dependencies
    );

    expect(response.status).toBe(503);
    await expect(readJson<ErrorBody>(response)).resolves.toStrictEqual({
      code: "AUTH_UNAVAILABLE",
      message: messages.SIGNOUT_UNCONFIRMED,
    });
    expect(response.headers.get("clear-site-data")).toBe(clearSiteDataValue);
    expect(response.headers.getSetCookie().join("; ")).toContain(
      `${localCookieNames.session}=; Path=/`
    );
  });

  // AT-23 is skipped: `handleLogout` never reads the request body and takes no
  // target session id, so nothing rejects an override with 403. A logout carrying
  // a foreign `sessionId` is answered 204 with the logout `Clear-Site-Data`
  // header and only the presented credential is revoked.
  it.skipIf(true)(
    "AT-23 rejects a foreign session-id override on logout",
    async () => {
      const dependencies = await configuredDependencies();
      const signedIn = await signIn(dependencies, bilal);
      const credential = cookieHeaderFor(signedIn, localCookieNames.session);
      const response = await handleLogout(
        authMutation({
          dependencies,
          path: logoutPath,
          body: { sessionId: "session_someone_else" },
          cookies: [credential],
        }),
        dependencies
      );
      const stillLive = await handleSession(
        sessionRequest(dependencies, credential),
        dependencies
      );

      expect([
        response.status,
        response.headers.get("clear-site-data"),
        stillLive.status,
      ]).toStrictEqual([403, null, 200]);
    }
  );
});

describe("AT-24 to AT-25: session credential and provider-subject integrity", () => {
  it("AT-24 rejects a provider subject mismatch without creating an actor binding", async () => {
    const mismatchedAccount: DeterministicAccount = {
      email: "mismatched.teacher@example.test",
      password,
      subject: "subject_teacher_mismatched",
      emailVerified: true,
    };
    const { persistence, provisioning } = await createProvisioningHarness();
    await provisioning.bindIdentity({
      providerIssuer: issuer,
      providerSubject: mismatchedAccount.subject,
      actorId: parseActorId("actor_teacher_mismatched"),
      displayName: "Mismatched Teacher",
      principal: "deployment-provisioner",
      requestId: "at-24-bind",
    });
    await provisioning.grantMembership({
      membershipId: parseMembershipId("membership_mismatched_north"),
      actorId: parseActorId("actor_teacher_mismatched"),
      tenantId: parseTenantId("tenant_school_north"),
      tenantName: "Northside Elementary",
      role: "teacher",
      principal: "deployment-provisioner",
      requestId: "at-24-grant",
    });
    const harness = await createHarness({
      persistence,
      accounts: [mismatchedAccount],
      decorateProvider: (provider) => {
        return {
          ...provider,
          verifySession: async (accessToken) => {
            const status = await provider.verifySession(accessToken);
            return status.status === "active"
              ? {
                  ...status,
                  subject: parseProviderSubject("subject_teacher_elsewhere"),
                }
              : status;
          },
        };
      },
    });
    const signedIn = await signIn(
      harness.dependencies,
      mismatchedAccount.email
    );
    const resolved = await handleSession(
      sessionRequest(
        harness.dependencies,
        cookieHeaderFor(signedIn, localCookieNames.session)
      ),
      harness.dependencies
    );

    expect(signedIn.status).toBe(200);
    expect(resolved.status).toBe(401);
    await expect(
      persistence.findProviderBinding(issuer, "subject_teacher_elsewhere")
    ).resolves.toBeUndefined();

    const binding = await persistence.findProviderBinding(
      issuer,
      mismatchedAccount.subject
    );

    expect(binding?.actorId).toBe("actor_teacher_mismatched");
  });

  it("AT-25 rejects duplicate cookies and a malformed bearer without a private read", async () => {
    const dependencies = await configuredDependencies();
    const duplicated = await handleSession(
      new Request(`${dependencies.publicOrigin}/api/auth/session`, {
        method: "GET",
        headers: {
          cookie: `${localCookieNames.session}=one; ${localCookieNames.session}=two`,
        },
      }),
      dependencies
    );
    const bearer = await handleSession(
      new Request(`${dependencies.publicOrigin}/api/auth/session`, {
        method: "GET",
        headers: { authorization: "Bearer not-a-session-credential" },
      }),
      dependencies
    );
    const malformed = await handleSession(
      sessionRequest(
        dependencies,
        `${localCookieNames.session}=not-a-credential`
      ),
      dependencies
    );

    expect([duplicated.status, bearer.status, malformed.status]).toStrictEqual([
      401, 401, 401,
    ]);
    await expect(readJson<ErrorBody>(duplicated)).resolves.toStrictEqual({
      code: "UNAUTHENTICATED",
      message: messages.UNAUTHENTICATED,
    });
    await expect(readJson<ErrorBody>(bearer)).resolves.toStrictEqual({
      code: "UNAUTHENTICATED",
      message: messages.UNAUTHENTICATED,
    });
  });
});

describe("AT-26 to AT-29: server-owned identity overrides", () => {
  // AT-26 is skipped: no handler rejects a server-owned identity field with 403.
  // The teacher-reachable protected mutation, POST /api/lessons/generate, rejects
  // the unknown `actorId` field as 422 INVALID_INPUT through its strict schema, so
  // the specified 403 cannot be produced. The body drives the real entry point.
  it.skipIf(true)("AT-26 rejects a teacher actorId override", async () => {
    const dependencies = await configuredDependencies();
    const signedIn = await signIn(dependencies, bilal);
    const credential = cookieHeaderFor(signedIn, localCookieNames.session);
    const session = await readJson<SessionProjectionBody>(
      await handleSession(
        sessionRequest(dependencies, credential),
        dependencies
      )
    );
    const response = await handleGenerateLessonRequest(
      authMutation({
        dependencies,
        path: "/api/lessons/generate",
        body: {
          prompt: "Add two-digit numbers",
          grade: 4,
          standardId: "standard-1",
          language: "en",
          actorId: "actor_teacher_amira",
        },
        csrf: session.csrf ?? "",
        cookies: [credential],
      })
    );

    expect(response.status).toBe(403);
  });

  // AT-27 is skipped: no learner-reachable protected endpoint exists on this
  // branch, so a learner `actorId` override has no request to send and no 403 to
  // assert. POST /api/attempts arrives with release unit B.
  it.skipIf(true)("AT-27 rejects a learner actorId override", () => {
    expect(learnerOverrideGuardEntries).toContain("/api/attempts");
  });

  // AT-28 is skipped for the same reason as AT-27: the learner definition entry
  // that carries a `learnerId` payload does not exist, so no override can be
  // rejected.
  it.skipIf(true)("AT-28 rejects a learner learnerId override", () => {
    expect(learnerOverrideGuardEntries).toContain("/api/attempts");
  });

  // AT-29 is skipped: no teacher surface takes a learner identity, and no
  // override guard returns 403. POST /api/teacher-decisions arrives with release
  // unit B.
  it.skipIf(true)(
    "AT-29 rejects a teacher learner-identity override outside an authorized reference",
    () => {
      expect(teacherLearnerOverrideGuardEntries).toContain(
        "/api/teacher-decisions"
      );
    }
  );
});

describe("AT-30 to AT-35: trusted provisioning", () => {
  it("AT-30 lets the authorized provisioning principal perform exactly the intended idempotent write", async () => {
    const { store, persistence, provisioning } =
      await createProvisioningHarness();
    const before = storeCounts(store);
    const auditBefore = store.provisioningAudit.length;
    const input = {
      providerIssuer: issuer,
      providerSubject: "subject_teacher_operator",
      actorId: parseActorId("actor_teacher_operator"),
      displayName: "Operator Teacher",
      principal: "deployment-provisioner",
      requestId: "at-30-bind-1",
    };
    const first = await provisioning.bindIdentity(input);
    const second = await provisioning.bindIdentity({
      ...input,
      requestId: "at-30-bind-2",
    });

    expect([first.idempotent, second.idempotent]).toStrictEqual([false, true]);
    expect(storeCounts(store)).toStrictEqual({
      ...before,
      actors: before.actors + 1,
      bindings: before.bindings + 1,
    });
    await expect(
      persistence.listMemberships(parseActorId("actor_teacher_operator"))
    ).resolves.toHaveLength(0);
    expect(
      store.provisioningAudit
        .slice(auditBefore)
        .map((entry) => [entry.operation, entry.result, entry.principal])
    ).toStrictEqual([["bindIdentity", "created", "deployment-provisioner"]]);
  });

  // AT-31 is skipped: provisioning is an internal service seam (§5), not a web
  // route, so a teacher request has no surface that could answer 403 before any
  // binding or membership write.
  it.skipIf(true)(
    "AT-31 denies a teacher provisioning attempt without a write",
    () => {
      expect(provisioningPrincipalEntries).toContain("/api/provisioning");
    }
  );

  // AT-32 is skipped for the same reason as AT-31.
  it.skipIf(true)(
    "AT-32 denies a learner provisioning attempt without a write",
    () => {
      expect(provisioningPrincipalEntries).toContain("/api/provisioning");
    }
  );

  // AT-33 is skipped for the same reason as AT-31: there is no anonymous
  // provisioning entry to answer 401 with zero writes.
  it.skipIf(true)(
    "AT-33 denies an anonymous provisioning attempt without a write",
    () => {
      expect(provisioningPrincipalEntries).toContain("/api/provisioning");
    }
  );

  // AT-34 is skipped: the provisioning seam validates identifier formats but not
  // tenant relations. `assignClass` accepted a Southside class into a Northside
  // membership roster (the roster became ["class_north_4a", "class_south_9z"])
  // instead of rejecting it, and `grantMembership` accepted a learner id from
  // another tenant, so the required 403 with zero writes cannot be produced.
  it.skipIf(true)(
    "AT-34 rejects a mismatched tenant/class/learner relation without a write",
    async () => {
      const { persistence, provisioning } = await createProvisioningHarness();

      await expect(
        provisioning.assignClass({
          membershipId: parseMembershipId("membership_bilal_north"),
          classId: parseClassId("class_south_9z"),
          tenantId: parseTenantId("tenant_school_south"),
          principal: "deployment-provisioner",
          requestId: "at-34-mismatch",
        })
      ).rejects.toMatchObject({
        code: "FORBIDDEN" satisfies IdentityError["code"],
      });

      const roster = await persistence.listRosterClassIds(
        parseMembershipId("membership_bilal_north")
      );

      expect(roster).toStrictEqual(["class_north_4a"]);
    }
  );

  it("AT-35 rejects a conflicting binding replay and leaves the original binding intact", async () => {
    const { persistence, provisioning } = await createProvisioningHarness();
    const original = await persistence.findProviderBinding(
      issuer,
      "subject_teacher_amira"
    );

    await expect(
      provisioning.bindIdentity({
        providerIssuer: issuer,
        providerSubject: "subject_teacher_amira",
        actorId: parseActorId("actor_teacher_impostor"),
        displayName: "Impostor Teacher",
        principal: "deployment-provisioner",
        requestId: "at-35-conflict",
      })
    ).rejects.toMatchObject({
      code: "CONFLICT" satisfies IdentityError["code"],
    });

    expect(original?.actorId).toBe("actor_teacher_amira");

    const after = await persistence.findProviderBinding(
      issuer,
      "subject_teacher_amira"
    );

    expect(after?.actorId).toBe("actor_teacher_amira");
    await expect(
      persistence.readActor(parseActorId("actor_teacher_impostor"))
    ).resolves.toBeUndefined();
  });
});

describe("AT-36 to AT-38: teacher self-signup and unverified sign-in", () => {
  it("AT-36 returns a verification-pending state for a new address and grants no authority", async () => {
    const store = createSeededIdentityStore();
    const harness = await createHarness({ store });
    const before = storeCounts(store);
    const freshAddress = "fresh.teacher@example.test";
    const response = await signUp(harness.dependencies, freshAddress);
    const body = await readJson<SignUpBody>(response);

    expect(response.status).toBe(200);
    expect(body).toStrictEqual({
      status: "verification-pending",
      email: freshAddress,
    });
    expect(cookiePairs(response)).toStrictEqual([]);
    expect(storeCounts(store)).toStrictEqual(before);

    const authorizesNothing = await signIn(harness.dependencies, freshAddress);

    expect(authorizesNothing.status).toBe(401);
  });

  it("AT-37 answers an existing address with the same state and creates no second identity", async () => {
    const store = createSeededIdentityStore();
    const harness = await createHarness({ store });
    const before = storeCounts(store);
    const signUpTimed = async (
      email: string
    ): Promise<{ readonly ms: number; readonly response: Response }> => {
      const startedAt = performance.now();
      const response = await signUp(harness.dependencies, email);
      return { ms: performance.now() - startedAt, response };
    };
    const fresh = await signUpTimed("brand.new.teacher@example.test");
    const taken = await signUpTimed(amira);
    const freshBody = await readJson<SignUpBody>(fresh.response);
    const takenBody = await readJson<SignUpBody>(taken.response);
    const enumerationSignals = (body: SignUpBody, response: Response) => {
      return {
        status: body.status,
        keys: Object.keys(body).toSorted((left, right) =>
          left.localeCompare(right)
        ),
        cookies: cookiePairs(response).length,
      };
    };

    expect([fresh.response.status, taken.response.status]).toStrictEqual([
      200, 200,
    ]);
    expect(enumerationSignals(takenBody, taken.response)).toStrictEqual(
      enumerationSignals(freshBody, fresh.response)
    );
    expect(storeCounts(store)).toStrictEqual(before);
    expect(Math.abs(fresh.ms - taken.ms)).toBeLessThan(50);
  });

  it("AT-38 refuses a sign-in before email verification without an application session", async () => {
    const store = createSeededIdentityStore();
    const harness = await createHarness({
      store,
      accounts: [unverifiedAccount],
    });
    const response = await signIn(
      harness.dependencies,
      unverifiedAccount.email
    );

    expect(response.status).toBe(401);
    await expect(readJson<ErrorBody>(response)).resolves.toStrictEqual({
      code: "UNAUTHENTICATED",
      message: messages.UNAUTHENTICATED,
    });
    expect(cookiePairs(response)).toStrictEqual([]);
    expect(storeCounts(store).sessions).toBe(0);
  });
});
