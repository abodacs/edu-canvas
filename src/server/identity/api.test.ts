import { describe, expect, it } from "vitest";

import { readServerConfig } from "../config";
import { createSeededIdentityPersistence } from "../persistence/identity-seeded";
import { testServerEnvironment } from "../test-environment";
import {
  handleAuthContext,
  handleContinue,
  handleLogout,
  handleMembership,
  handleSession,
  handleSignIn,
  authDependenciesFrom,
  resolveTeacherActor,
  resolveTeacherSession,
} from "./api.server";
import { buildConfiguredIdentity } from "./composition.server";

import type { AuthDependencies } from "./api.server";

const password = "synthetic-pass-1";

const testConfig = readServerConfig({ ...testServerEnvironment });
const testDependencies = authDependenciesFrom(
  testConfig,
  await buildConfiguredIdentity(testConfig, createSeededIdentityPersistence())
);

const dependencies = (): Promise<AuthDependencies> =>
  Promise.resolve(testDependencies);

const cookiesFrom = (response: Response): string[] =>
  response.headers.getSetCookie();

const cookieValue = (response: Response, name: string): string | undefined => {
  const match = cookiesFrom(response)
    .map((cookie) => cookie.split(";", 1)[0] ?? "")
    .find((pair) => pair.startsWith(`${name}=`));
  return match?.slice(name.length + 1);
};

const bootstrapFlow = async (sessionDependencies: AuthDependencies) => {
  const context = await handleAuthContext(
    new Request(`${sessionDependencies.publicOrigin}/api/auth/context`, {
      method: "GET",
    }),
    sessionDependencies
  );
  const body = (await context.json()) as { csrf: string };
  const challengeCookie = cookieValue(context, "edu_canvas_csrf") ?? "";
  return {
    csrf: body.csrf,
    cookie: `edu_canvas_csrf=${challengeCookie}`,
  };
};

interface MembershipBody {
  readonly memberships?: readonly {
    readonly membershipId: string;
    readonly tenantName: string;
  }[];
}

/**
The fixture teachers also hold the curriculum classroom membership, so an established session selects it exactly like a production client must.
*/
const selectCurriculumMembership = async (
  sessionDependencies: AuthDependencies,
  signInResponse: Response,
  memberships: MembershipBody["memberships"]
): Promise<Response> => {
  const classroom =
    memberships?.find(
      (membership) => membership.tenantName === "Edu-Canvas Synthetic Classroom"
    ) ??
    memberships?.find((membership) =>
      membership.membershipId.includes("_demo")
    ) ??
    memberships?.[0];
  const flow = await bootstrapFlow(sessionDependencies);
  return handleMembership(
    new Request(`${sessionDependencies.publicOrigin}/api/auth/membership`, {
      method: "POST",
      headers: {
        origin: sessionDependencies.publicOrigin,
        "content-type": "application/json",
        "x-edu-canvas-csrf": flow.csrf,
        cookie: `edu_canvas_pending=${
          cookieValue(signInResponse, "edu_canvas_pending") ?? ""
        }; ${flow.cookie}`,
      },
      body: JSON.stringify({ membershipId: classroom?.membershipId ?? "" }),
    }),
    sessionDependencies
  );
};

const signIn = async (
  sessionDependencies: AuthDependencies,
  email = "bilal.north@example.test"
) => {
  const flow = await bootstrapFlow(sessionDependencies);
  const response = await handleSignIn(
    new Request(`${sessionDependencies.publicOrigin}/api/auth/sign-in`, {
      method: "POST",
      headers: {
        origin: sessionDependencies.publicOrigin,
        "content-type": "application/json",
        "x-edu-canvas-csrf": flow.csrf,
        cookie: flow.cookie,
      },
      body: JSON.stringify({
        email,
        password,
      }),
    }),
    sessionDependencies
  );
  const body = (await response.clone().json()) as MembershipBody & {
    status?: string;
  };
  const established =
    body.status === "membership-required"
      ? await selectCurriculumMembership(
          sessionDependencies,
          response,
          body.memberships
        )
      : response;
  return {
    response: established,
    sessionCookie: `edu_canvas_session=${cookieValue(established, "edu_canvas_session") ?? ""}`,
    flow,
  };
};

describe("auth context and challenge", () => {
  it("issues a pre-auth challenge without account data", async () => {
    const sessionDependencies = await dependencies();
    const response = await handleAuthContext(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/context`, {
        method: "GET",
      }),
      sessionDependencies
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body)).toStrictEqual(["csrf"]);
    expect(cookiesFrom(response).join(";")).toContain("HttpOnly");
  });
});

describe("sign-in guards", () => {
  it("rejects a mutation with an absent or foreign origin before effects", async () => {
    const sessionDependencies = await dependencies();
    const flow = await bootstrapFlow(sessionDependencies);
    const missing = await handleSignIn(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/sign-in`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-edu-canvas-csrf": flow.csrf,
          cookie: flow.cookie,
        },
        body: JSON.stringify({ email: "bilal.north@example.test", password }),
      }),
      sessionDependencies
    );

    expect(missing.status).toBe(403);
    await expect(missing.json()).resolves.toMatchObject({
      code: "CSRF_REJECTED",
    });
    expect(cookiesFrom(missing)).toHaveLength(0);

    const foreign = await handleSignIn(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/sign-in`, {
        method: "POST",
        headers: {
          origin: "https://evil.test",
          "content-type": "application/json",
          "x-edu-canvas-csrf": flow.csrf,
          cookie: flow.cookie,
        },
        body: JSON.stringify({ email: "bilal.north@example.test", password }),
      }),
      sessionDependencies
    );

    expect(foreign.status).toBe(403);
  });

  it("rejects a replayed pre-auth proof without contacting the provider", async () => {
    const sessionDependencies = await dependencies();
    const flow = await bootstrapFlow(sessionDependencies);
    const response = await handleSignIn(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/sign-in`, {
        method: "POST",
        headers: {
          origin: sessionDependencies.publicOrigin,
          "content-type": "application/json",
          "x-edu-canvas-csrf": "forged-challenge",
          cookie: flow.cookie,
        },
        body: JSON.stringify({ email: "bilal.north@example.test", password }),
      }),
      sessionDependencies
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "CSRF_REJECTED",
    });
  });

  it("returns one generic error for bad credentials", async () => {
    const sessionDependencies = await dependencies();
    const flow = await bootstrapFlow(sessionDependencies);
    const response = await handleSignIn(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/sign-in`, {
        method: "POST",
        headers: {
          origin: sessionDependencies.publicOrigin,
          "content-type": "application/json",
          "x-edu-canvas-csrf": flow.csrf,
          cookie: flow.cookie,
        },
        body: JSON.stringify({
          email: "bilal.north@example.test",
          password: "wrong-password",
        }),
      }),
      sessionDependencies
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});

describe("session projection", () => {
  it("returns a safe active projection and rejects an unauthenticated read", async () => {
    const sessionDependencies = await dependencies();
    const { sessionCookie } = await signIn(sessionDependencies);

    const response = await handleSession(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/session`, {
        method: "GET",
        headers: { cookie: sessionCookie },
      }),
      sessionDependencies
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;

    expect(body).toMatchObject({ status: "active" });
    expect(JSON.stringify(body)).not.toContain("password");
    expect(JSON.stringify(body)).not.toContain("verifierHash");

    const anonymous = await handleSession(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/session`, {
        method: "GET",
      }),
      sessionDependencies
    );

    expect(anonymous.status).toBe(401);
  });

  it("rejects duplicate credential cookies", async () => {
    const sessionDependencies = await dependencies();
    const response = await handleSession(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/session`, {
        method: "GET",
        headers: {
          cookie: "edu_canvas_session=one; edu_canvas_session=two",
        },
      }),
      sessionDependencies
    );

    expect(response.status).toBe(401);
  });
});

describe("continue", () => {
  it("requires the session-bound challenge and then renews idle time", async () => {
    const sessionDependencies = await dependencies();
    const { sessionCookie } = await signIn(sessionDependencies);

    const session = await handleSession(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/session`, {
        method: "GET",
        headers: { cookie: sessionCookie },
      }),
      sessionDependencies
    );
    const { csrf } = (await session.json()) as { csrf: string };

    const forged = await handleContinue(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/continue`, {
        method: "POST",
        headers: {
          origin: sessionDependencies.publicOrigin,
          "x-edu-canvas-csrf": "forged",
          cookie: sessionCookie,
        },
      }),
      sessionDependencies
    );

    expect(forged.status).toBe(403);

    const renewed = await handleContinue(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/continue`, {
        method: "POST",
        headers: {
          origin: sessionDependencies.publicOrigin,
          "x-edu-canvas-csrf": csrf,
          cookie: sessionCookie,
        },
      }),
      sessionDependencies
    );

    expect(renewed.status).toBe(200);
    await expect(renewed.json()).resolves.toMatchObject({ status: "active" });
  });
});

describe("logout header contract", () => {
  const clearSiteData = [
    '"cache"',
    '"cookies"',
    '"storage"',
    '"executionContexts"',
    '"prefetchCache"',
    '"prerenderCache"',
  ].join(", ");

  it("revokes on 204 and carries the exact Clear-Site-Data value", async () => {
    const sessionDependencies = await dependencies();
    const { sessionCookie } = await signIn(sessionDependencies);

    const session = await handleSession(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/session`, {
        method: "GET",
        headers: { cookie: sessionCookie },
      }),
      sessionDependencies
    );
    const { csrf } = (await session.json()) as { csrf: string };

    const response = await handleLogout(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/logout`, {
        method: "POST",
        headers: {
          origin: sessionDependencies.publicOrigin,
          "x-edu-canvas-csrf": csrf,
          cookie: sessionCookie,
        },
      }),
      sessionDependencies
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("clear-site-data")).toBe(clearSiteData);
    // Session and challenge cookies are cleared as separate headers; joined into
    // one value a browser would treat the second as an attribute of the first.
    expect(response.headers.getSetCookie()).toHaveLength(2);

    const replay = await handleSession(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/session`, {
        method: "GET",
        headers: { cookie: sessionCookie },
      }),
      sessionDependencies
    );

    expect(replay.status).toBe(401);
  });

  it("tolerates logout without a live credential and still returns 204", async () => {
    const sessionDependencies = await dependencies();
    const response = await handleLogout(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/logout`, {
        method: "POST",
        headers: { origin: sessionDependencies.publicOrigin },
      }),
      sessionDependencies
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("clear-site-data")).toBe(clearSiteData);
  });

  it("omits Clear-Site-Data on a rejected logout", async () => {
    const sessionDependencies = await dependencies();
    const response = await handleLogout(
      new Request(`${sessionDependencies.publicOrigin}/api/auth/logout`, {
        method: "POST",
        headers: { origin: "https://evil.test" },
      }),
      sessionDependencies
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("clear-site-data")).toBeNull();
  });
});

const teacherRequest = (
  sessionDependencies: AuthDependencies,
  cookie: string | undefined
): Request => {
  return new Request(`${sessionDependencies.publicOrigin}/lesson/preview`, {
    method: "GET",
    ...(cookie && { headers: { cookie } }),
  });
};

describe("teacher delivery seam", () => {
  it("returns the verified teacher actor for an active session", async () => {
    const sessionDependencies = await dependencies();
    const { sessionCookie } = await signIn(sessionDependencies);

    const resolved = await resolveTeacherSession(
      teacherRequest(sessionDependencies, sessionCookie),
      sessionDependencies
    );

    expect(resolved).toMatchObject({
      ok: true,
      actor: { role: "teacher", actorId: "actor_teacher_bilal" },
      sessionId: expect.any(String),
    });
  });

  it("refuses a learner session", async () => {
    const sessionDependencies = await dependencies();
    const { sessionCookie } = await signIn(
      sessionDependencies,
      "lina.north@example.test"
    );

    const resolved = await resolveTeacherSession(
      teacherRequest(sessionDependencies, sessionCookie),
      sessionDependencies
    );

    expect(resolved).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("refuses a request with no session", async () => {
    const sessionDependencies = await dependencies();

    const resolved = await resolveTeacherSession(
      teacherRequest(sessionDependencies, undefined),
      sessionDependencies
    );

    expect(resolved).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("fails closed when the configuration is invalid", async () => {
    const invalid = readServerConfig({ APP_ENV: "production" });

    const resolved = await resolveTeacherActor(
      new Request("https://education.example.test/lesson/preview"),
      invalid
    );

    expect(resolved).toMatchObject({
      ok: false,
      error: { code: "AUTH_UNAVAILABLE" },
    });
  });
});
