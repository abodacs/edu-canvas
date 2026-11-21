import { describe, expect, it } from "vitest";

import { readServerConfig } from "../config";
import { createSeededIdentityPersistence } from "../persistence/identity-seeded";
import { testServerEnvironment } from "../test-environment";
import {
  handleAuthContext,
  handleMembership,
  handleSignIn,
  handleSignUp,
  authDependenciesFrom,
} from "./api.server";
import { buildConfiguredIdentity } from "./composition.server";

import type { AuthDependencies } from "./api.server";

const password = "synthetic-pass-1";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMembershipList = (
  value: unknown
): value is { membershipId: string; tenantName: string }[] =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.membershipId === "string" &&
      typeof entry.tenantName === "string"
  );

const membershipsOf = (body: Record<string, unknown>) => {
  if (!isMembershipList(body.memberships)) {
    throw new TypeError("the sign-in response must carry a membership list");
  }
  return body.memberships;
};

const testConfig = readServerConfig({ ...testServerEnvironment });
const testDependencies = authDependenciesFrom(
  testConfig,
  await buildConfiguredIdentity(testConfig, createSeededIdentityPersistence())
);

const sessionDependencies = async (): Promise<AuthDependencies> =>
  await Promise.resolve(testDependencies);

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

const challenge = async (dependencies: AuthDependencies) => {
  const response = await handleAuthContext(
    new Request(`${dependencies.publicOrigin}/api/auth/context`, {
      method: "GET",
    }),
    dependencies
  );
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.csrf !== "string") {
    throw new TypeError("the auth context response must carry a csrf token");
  }
  return {
    csrf: body.csrf,
    cookie: `edu_canvas_csrf=${cookieValue(response, "edu_canvas_csrf") ?? ""}`,
  };
};

const dualMembershipEmail = "amira.north@example.test";

const signInAmira = async (
  dependencies: AuthDependencies
): Promise<Response> => {
  const flow = await challenge(dependencies);
  return await handleSignIn(
    new Request(`${dependencies.publicOrigin}/api/auth/sign-in`, {
      method: "POST",
      headers: {
        origin: dependencies.publicOrigin,
        "content-type": "application/json",
        "x-edu-canvas-csrf": flow.csrf,
        cookie: flow.cookie,
      },
      body: JSON.stringify({ email: dualMembershipEmail, password }),
    }),
    dependencies
  );
};

const selectMembership = async ({
  dependencies,
  signInResponse,
  membershipId,
}: {
  dependencies: AuthDependencies;
  signInResponse: Response;
  membershipId: string;
}): Promise<Response> => {
  const flow = await challenge(dependencies);
  const pending = `edu_canvas_pending=${
    cookieValue(signInResponse, "edu_canvas_pending") ?? ""
  }`;
  return await handleMembership(
    new Request(`${dependencies.publicOrigin}/api/auth/membership`, {
      method: "POST",
      headers: {
        origin: dependencies.publicOrigin,
        "content-type": "application/json",
        "x-edu-canvas-csrf": flow.csrf,
        cookie: `${pending}; ${flow.cookie}`,
      },
      body: JSON.stringify({ membershipId }),
    }),
    dependencies
  );
};

describe("membership selection over HTTP", () => {
  it("returns a bounded pending state listing only own memberships", async () => {
    const dependencies = await sessionDependencies();
    const response = await signInAmira(dependencies);
    const body: unknown = await response.json();
    if (!isRecord(body)) {
      throw new TypeError("the sign-in response must be a JSON object");
    }
    const memberships = membershipsOf(body);
    const { status } = body;
    if (typeof status !== "string") {
      throw new TypeError("the sign-in response must carry a status");
    }

    expect({
      status: response.status,
      bodyStatus: status,
      membershipCount: memberships.length,
      leaksVerifier: JSON.stringify(body).includes("verifierHash"),
    }).toStrictEqual({
      status: 200,
      bodyStatus: "membership-required",
      membershipCount: 3,
      leaksVerifier: false,
    });
  });

  it("selects an own membership and rotates into a session credential", async () => {
    const dependencies = await sessionDependencies();
    const signInResponse = await signInAmira(dependencies);
    const body: unknown = await signInResponse.json();
    if (!isRecord(body)) {
      throw new TypeError("the sign-in response must be a JSON object");
    }
    const south = membershipsOf(body).find(
      (membership) => membership.tenantName === "Grade 5B · Ratio Reasoning"
    );

    const selected = await selectMembership({
      dependencies,
      signInResponse,
      membershipId: south?.membershipId ?? "",
    });

    expect(selected.status).toBe(200);
    await expect(selected.json()).resolves.toMatchObject({
      status: "active",
      actor: { tenantName: "Grade 5B · Ratio Reasoning" },
    });
    expect(cookieValue(selected, "edu_canvas_session")).toBeDefined();
    expect(selected.headers.getSetCookie()).toHaveLength(2);
  });

  it("refuses a foreign membership with one generic error", async () => {
    const dependencies = await sessionDependencies();
    const signInResponse = await signInAmira(dependencies);

    const response = await selectMembership({
      dependencies,
      signInResponse,
      membershipId: "membership_not_mine",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "FORBIDDEN" });
    expect(cookiePairs(response)).toHaveLength(0);
  });
});

describe("teacher sign-up over HTTP", () => {
  it("returns the same verification-pending state for a new and a taken address", async () => {
    const dependencies = await sessionDependencies();

    const submit = async (email: string): Promise<Response> => {
      const flow = await challenge(dependencies);
      return await handleSignUp(
        new Request(`${dependencies.publicOrigin}/api/auth/sign-up`, {
          method: "POST",
          headers: {
            origin: dependencies.publicOrigin,
            "content-type": "application/json",
            "x-edu-canvas-csrf": flow.csrf,
            cookie: flow.cookie,
          },
          body: JSON.stringify({ email, password }),
        }),
        dependencies
      );
    };

    const fresh = await submit("brand.new.teacher@example.test");
    const taken = await submit("amira.north@example.test");

    expect({
      freshStatus: fresh.status,
      takenStatus: taken.status,
      freshSetsCookie: cookiePairs(fresh).length > 0,
      takenSetsCookie: cookiePairs(taken).length > 0,
    }).toStrictEqual({
      freshStatus: 200,
      takenStatus: 200,
      freshSetsCookie: false,
      takenSetsCookie: false,
    });
    await expect(fresh.json()).resolves.toStrictEqual({
      status: "verification-pending",
      email: "brand.new.teacher@example.test",
    });
    await expect(taken.json()).resolves.toStrictEqual({
      status: "verification-pending",
      email: "amira.north@example.test",
    });
  });
});
