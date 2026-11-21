/* eslint-disable no-inline-comments, unicorn/consistent-function-scoping -- the vite chunkname must be an inline block comment inside the hoisted mock imports, and the mock helpers must live inside vi.hoisted. */
import { describe, expect, it, vi } from "vitest";

import { IdentityError } from "@/server/identity/errors";
import { RecordStoreError } from "@/server/records/errors";
import { teacherProgressResponseSchema } from "@/shared/progress-contract";
import {
  handleTeacherProgressRequest,
  progressErrorJson,
} from "./progress.server";

vi.stubEnv("APP_ENV", "development");
vi.stubEnv(
  "DATABASE_URL",
  "postgresql://test:test@127.0.0.1:5432/edu_canvas_test"
);
vi.stubEnv("META_API_KEY", "test-server-key");
vi.stubEnv("AUTH_PROVIDER", "deterministic");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const mocks = vi.hoisted(() => {
  const identityErrorJson = (error: {
    readonly code: string;
    readonly message: string;
    readonly status: number;
  }): Response => {
    return Response.json(
      { code: error.code, message: error.message },
      { status: error.status }
    );
  };
  const readTeacherProgress = vi.fn<() => Promise<unknown>>();
  return {
    resolveTeacherActor: vi.fn<() => Promise<unknown>>(),
    readTeacherProgress,
    recordPersistence: { readTeacherProgress },
    identityErrorJson,
  };
});

vi.mock(
  import(
    /* webpackChunkName: "progress-delivery-identity" */ "@/server/identity/api.server"
  ),
  async (importOriginal) => {
    const actual = await importOriginal();
    const merged = { ...actual };
    return Object.assign(merged, {
      resolveTeacherActor: mocks.resolveTeacherActor,
      identityErrorJson: mocks.identityErrorJson,
    });
  }
);

vi.mock(
  import(
    /* webpackChunkName: "progress-delivery-persistence" */ "@/server/persistence"
  ),
  async (importOriginal) => {
    const actual = await importOriginal();
    const merged = { ...actual };
    return Object.assign(merged, {
      createRecordPersistence: () => mocks.recordPersistence,
    });
  }
);

const request = () => new Request("http://localhost:3000/api/teacher/progress");

const teacherResolution = {
  ok: true as const,
  actor: {
    actorId: "actor_teacher_progress",
    role: "teacher" as const,
    tenantId: "tenant_school_north",
  },
};

describe(handleTeacherProgressRequest, () => {
  it("refuses an unresolved session before touching records", async () => {
    mocks.resolveTeacherActor.mockResolvedValue({
      ok: false,
      error: new IdentityError("FORBIDDEN"),
    });

    const response = await handleTeacherProgressRequest(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.readTeacherProgress).not.toHaveBeenCalled();
  });

  it("returns the parsed progress response for a teacher session", async () => {
    mocks.resolveTeacherActor.mockResolvedValue(teacherResolution);
    mocks.readTeacherProgress.mockResolvedValue({
      fetchedAt: "2026-10-28T00:00:00.000Z",
      runs: [],
    });

    const response = await handleTeacherProgressRequest(request());

    expect(response.status).toBe(200);

    const body = teacherProgressResponseSchema.parse(await response.json());

    expect(body.runs).toStrictEqual([]);
    expect(mocks.readTeacherProgress).toHaveBeenCalledWith(
      teacherResolution.actor
    );
  });

  it("maps a record boundary error to its transport status", async () => {
    mocks.resolveTeacherActor.mockResolvedValue(teacherResolution);
    mocks.readTeacherProgress.mockRejectedValue(
      new RecordStoreError("FORBIDDEN")
    );

    const response = await handleTeacherProgressRequest(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("answers a broken read with a designed unavailable code", async () => {
    mocks.resolveTeacherActor.mockResolvedValue(teacherResolution);
    mocks.readTeacherProgress.mockRejectedValue(
      new RecordStoreError("PERSISTENCE_UNAVAILABLE")
    );

    const response = await handleTeacherProgressRequest(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });

  it("answers an unexpected failure with one generic code", async () => {
    mocks.resolveTeacherActor.mockResolvedValue(teacherResolution);
    mocks.readTeacherProgress.mockRejectedValue(new Error("connection reset"));

    const response = await handleTeacherProgressRequest(request());

    expect(response.status).toBe(503);

    const body: unknown = await response.json();
    if (!isRecord(body)) {
      throw new TypeError("the progress refusal must be a JSON object");
    }

    expect(body.code).toBe("PROGRESS_UNAVAILABLE");
    expect(body.message).not.toContain("connection reset");
  });
});

describe(progressErrorJson, () => {
  it("maps an identity error to its safe transport status", () => {
    const response = progressErrorJson(new IdentityError("UNAUTHENTICATED"));

    expect(response.status).toBe(401);
  });
});
