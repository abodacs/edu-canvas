import { describe, expect, it } from "vitest";

import { readServerConfig } from "../config";
import {
  handleAuthContext,
  handleMembership,
  handleSignIn,
  handleSignUp,
  resolveAuthDependencies,
} from "./api.server";

import type { AuthDependencies } from "./api.server";

const testEnvironment = { APP_ENV: "development", DEMO_MODE: "true" };
const password = "synthetic-pass-1";

const sessionDependencies = (): Promise<AuthDependencies> =>
  resolveAuthDependencies(readServerConfig({ ...testEnvironment }));

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
  const body = (await response.json()) as { csrf: string };
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
  return handleSignIn(
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
  return handleMembership(
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
    const body = (await response.json()) as {
      status: string;
      memberships: { membershipId: string; tenantName: string }[];
    };

    expect({
      status: response.status,
      bodyStatus: body.status,
      membershipCount: body.memberships.length,
      leaksVerifier: JSON.stringify(body).includes("verifierHash"),
    }).toStrictEqual({
      status: 200,
      bodyStatus: "membership-required",
      membershipCount: 2,
      leaksVerifier: false,
    });
  });

  it("selects an own membership and rotates into a session credential", async () => {
    const dependencies = await sessionDependencies();
    const signInResponse = await signInAmira(dependencies);
    const body = (await signInResponse.json()) as {
      memberships: { membershipId: string; tenantName: string }[];
    };
    const south = body.memberships.find(
      (membership) => membership.tenantName === "Southside Middle"
    );

    const selected = await selectMembership({
      dependencies,
      signInResponse,
      membershipId: south?.membershipId ?? "",
    });

    expect(selected.status).toBe(200);
    await expect(selected.json()).resolves.toMatchObject({
      status: "active",
      actor: { tenantName: "Southside Middle" },
    });
    expect(cookieValue(selected, "edu_canvas_session")).toBeDefined();
    // The rotated session cookie and the cleared pending cookie are separate
    // headers; a browser would misread them as one joined value.
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
      return handleSignUp(
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

    // Same state, shape, and cookie behaviour for a new and an already-registered
    // address, so the response reveals nothing about existence.
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
