/* eslint-disable unicorn/single-line-block-comment-style -- import-x requires a single-line chunk-name comment for dynamic imports. */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServerObservability } from "./observability.server";

const sentryScope = {
  clear: vi.fn<() => void>(),
  setContext: vi.fn<(name: string, context: Record<string, unknown>) => void>(),
  setTag: vi.fn<(key: string, value: string) => void>(),
};

const sentrySdk = vi.hoisted(() => {
  return {
    captureException: vi.fn<(error: unknown) => void>(),
    init: vi.fn<(options?: unknown) => void>(),
    withIsolationScope: vi.fn<
      (work: (scope: typeof sentryScope) => void) => void
    >((work) => work(sentryScope)),
  };
});

vi.mock(
  import(
    /* webpackChunkName: "sentry-node" */
    "@sentry/node"
  ),
  () => sentrySdk as never
);

const captureProductionError = () => {
  const logs: unknown[] = [];
  const observability = createServerObservability({
    env: {
      APP_ENV: "production",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
    },
    logger: (event) => {
      logs.push(event);
    },
  });
  const wasInitializedBeforeCapture = sentrySdk.init.mock.calls.length > 0;

  observability.captureError(
    new Error("student identity_demo_student failed to load"),
    { safeCode: "PERSISTENCE_UNAVAILABLE" }
  );

  const { beforeSend } = sentrySdk.init.mock.calls[0]?.[0] as {
    beforeSend: (event: Record<string, unknown>) => Record<string, unknown>;
  };
  const scrubbedEvent = beforeSend({
    breadcrumbs: [{ message: "student identity_demo_student" }],
    contexts: {
      "edu-canvas": { reason: { name: "Alice Example" } },
      student: { id: "identity_demo_student" },
    },
    extra: { name: "Alice Example" },
    request: { data: { email: "student@example.com" } },
    user: { id: "identity_demo_student" },
  });

  return { logs, wasInitializedBeforeCapture, scrubbedEvent };
};

describe("the Sentry observability adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sentrySdk.init.mockReturnValue(undefined);
  });

  it("initializes Sentry lazily with the controlled options", () => {
    const { wasInitializedBeforeCapture } = captureProductionError();

    expect(wasInitializedBeforeCapture).toBeFalsy();
    expect(sentrySdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultIntegrations: false,
        sendDefaultPii: false,
        beforeSend: expect.any(Function),
      })
    );
  });

  it("drops unsafe event fields and redacts nested context", () => {
    const { scrubbedEvent } = captureProductionError();

    expect(scrubbedEvent).not.toHaveProperty("user");
    expect(scrubbedEvent).not.toHaveProperty("request");
    expect(scrubbedEvent).not.toHaveProperty("extra");
    expect(scrubbedEvent).not.toHaveProperty("breadcrumbs");
    expect(scrubbedEvent).toMatchObject({
      contexts: {
        "edu-canvas": {
          reason: "[REDACTED]",
        },
      },
    });
  });

  it("keeps sensitive identifiers out of the scrubbed event", () => {
    const { scrubbedEvent } = captureProductionError();
    const serialized = JSON.stringify(scrubbedEvent);

    expect(serialized).not.toContain("Alice Example");
    expect(serialized).not.toContain("identity_demo_student");
  });

  it("records the error once through the isolation scope", () => {
    captureProductionError();
    const capturedError = sentrySdk.captureException.mock.calls[0]?.[0];

    expect(sentrySdk.withIsolationScope).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function)
    );
    expect(sentryScope.clear).toHaveBeenCalledExactlyOnceWith();
    expect(sentrySdk.captureException).toHaveBeenCalledExactlyOnceWith(
      expect.any(Error)
    );
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).not.toContain(
      "identity_demo_student"
    );
  });

  it("delivers the error through the Sentry path", () => {
    const { logs } = captureProductionError();

    expect(logs[0]).toMatchObject({ delivery: "sentry" });
  });

  it("keeps structured logging when Sentry initialization fails", () => {
    sentrySdk.init.mockImplementationOnce(() => {
      throw new Error("Sentry initialization failed");
    });
    const logs: unknown[] = [];
    const observability = createServerObservability({
      env: {
        APP_ENV: "production",
        SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
      },
      logger: (event) => {
        logs.push(event);
      },
    });

    const event = observability.captureError(new Error("deliberate failure"));

    expect(event.delivery).toBe("structured-log");
    expect(logs).toHaveLength(1);
  });
});
