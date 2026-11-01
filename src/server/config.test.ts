import { describe, expect, it } from "vitest";

import {
  readDatabaseBootstrapConfig,
  readServerConfig,
  safeConfigSummary,
} from "./config";

describe("server configuration", () => {
  it("keeps synthetic database bootstrap independent of provider credentials", () => {
    const config = readDatabaseBootstrapConfig({
      APP_ENV: "preview",
      DATABASE_URL: "postgresql://demo:secret@db.invalid:5432/app",
    });

    expect(config).toMatchObject({
      databaseUrl: "postgresql://demo:secret@db.invalid:5432/app",
      syntheticDataOnly: true,
      issues: [],
    });
  });

  it("rejects real-student database bootstrap mode", () => {
    const config = readDatabaseBootstrapConfig({
      DATABASE_URL: "postgresql://demo:secret@db.invalid:5432/app",
      SYNTHETIC_DATA_ONLY: "false",
    });

    expect(config.issues).toContainEqual(
      expect.objectContaining({ code: "REAL_DATA_DISABLED" })
    );
  });

  it("requires database and provider configuration in every environment", () => {
    const config = readServerConfig({});

    expect(config).toMatchObject({
      appEnv: "development",
      syntheticDataOnly: true,
    });
    expect(config.issues.map((issue) => issue.code)).toStrictEqual([
      "OPENAI_API_KEY_REQUIRED",
      "DATABASE_REQUIRED",
    ]);
    expect(config.sentryDsn).toBeUndefined();
    // A summary must not claim a persistence backend the config never selected.
    expect(safeConfigSummary(config)).toMatchObject({
      persistence: "unconfigured",
      observability: { sentry: "structured-log-only" },
    });
  });

  it("enables Sentry only for a valid server-side DSN without exposing it", () => {
    const dsn = "https://public@example.ingest.sentry.io/123";
    const config = readServerConfig({ SENTRY_DSN: dsn });

    expect(config.sentryDsn).toBe(dsn);
    expect(safeConfigSummary(config)).toMatchObject({
      observability: { sentry: "configured" },
    });
    expect(JSON.stringify(safeConfigSummary(config))).not.toContain(dsn);
  });

  it("fails safe for an invalid Sentry DSN without echoing its value", () => {
    const dsn = "https://not-a-sentry-dsn";
    const config = readServerConfig({ SENTRY_DSN: dsn });

    expect(config.sentryDsn).toBeUndefined();
    expect(config.issues).toContainEqual({
      code: "INVALID_SENTRY_DSN",
      field: "SENTRY_DSN",
      message: "SENTRY_DSN must be a valid Sentry DSN URL.",
    });
    expect(JSON.stringify(config.issues)).not.toContain(dsn);
  });

  it("rejects a non-TLS Sentry DSN", () => {
    const config = readServerConfig({
      // The clear-text scheme is the input under test.
      // eslint-disable-next-line sonarjs/no-clear-text-protocols
      SENTRY_DSN: "http://public@example.ingest.sentry.io/123",
    });

    expect(config.sentryDsn).toBeUndefined();
    expect(config.issues).toContainEqual(
      expect.objectContaining({ code: "INVALID_SENTRY_DSN" })
    );
  });

  it("requires persistence in every environment", () => {
    const config = readServerConfig({
      APP_ENV: "production",
      OPENAI_API_KEY: "test-server-key",
    });

    expect(config.issues).toContainEqual({
      code: "DATABASE_REQUIRED",
      field: "DATABASE_URL",
      message: "Set DATABASE_URL for PostgreSQL persistence.",
    });
  });

  it("reports invalid configuration without echoing secret values", () => {
    const secret = "postgresql://demo:super-secret@db.invalid:5432/app";
    const config = readServerConfig({ DATABASE_URL: "not-a-database-url" });

    expect(
      config.issues.some((issue) => issue.code === "INVALID_DATABASE_URL")
    ).toBeTruthy();
    expect(JSON.stringify(config.issues)).not.toContain(secret);
  });

  it("blocks real-student mode until the launch gate is approved", () => {
    const config = readServerConfig({ SYNTHETIC_DATA_ONLY: "false" });

    expect(config.issues).toContainEqual({
      code: "REAL_DATA_DISABLED",
      field: "SYNTHETIC_DATA_ONLY",
      message:
        "Real-student mode is disabled until the compliance launch gate is approved.",
    });
  });

  it("fails safe for an invalid synthetic-data flag", () => {
    const config = readServerConfig({ SYNTHETIC_DATA_ONLY: "yes" });

    expect(config.syntheticDataOnly).toBeTruthy();
    expect(config.issues).toContainEqual({
      code: "INVALID_SYNTHETIC_DATA_ONLY",
      field: "SYNTHETIC_DATA_ONLY",
      message: "SYNTHETIC_DATA_ONLY must be true or false.",
    });
  });

  it("requires a server provider credential in every environment", () => {
    const config = readServerConfig({
      APP_ENV: "production",
      DATABASE_URL: "postgresql://demo:secret@db.invalid:5432/app",
    });

    expect(config.issues).toContainEqual({
      code: "OPENAI_API_KEY_REQUIRED",
      field: "OPENAI_API_KEY",
      message: "Set OPENAI_API_KEY for server-side lesson generation.",
    });
  });

  it("keeps the provider credential out of the safe configuration summary", () => {
    const config = readServerConfig({ OPENAI_API_KEY: "server-secret" });

    expect(JSON.stringify(safeConfigSummary(config))).not.toContain(
      "server-secret"
    );
  });

  it("rejects a non-HTTPS provider endpoint outside local development", () => {
    const config = readServerConfig({
      // The clear-text scheme is the input under test.
      // eslint-disable-next-line sonarjs/no-clear-text-protocols
      OPENAI_BASE_URL: "ftp://untrusted.invalid",
    });

    expect(config.issues).toContainEqual({
      code: "INVALID_OPENAI_BASE_URL",
      field: "OPENAI_BASE_URL",
      message:
        "OPENAI_BASE_URL must use HTTPS, or HTTP for a local loopback test server.",
    });
    expect(config.openAiBaseUrl).toBe("https://api.openai.com/v1");
  });

  it("uses a 100-second provider timeout by default", () => {
    expect(readServerConfig({}).openAiTimeoutMs).toBe(100_000);
  });

  it("accepts a bounded provider timeout override", () => {
    const config = readServerConfig({
      DATABASE_URL: "postgresql://demo:secret@db.invalid:5432/app",
      OPENAI_API_KEY: "test-server-key",
      OPENAI_TIMEOUT_MS: "45000",
    });

    expect(config.openAiTimeoutMs).toBe(45_000);
    expect(config.issues).toHaveLength(0);
  });

  it("fails safe for an invalid provider timeout", () => {
    const config = readServerConfig({ OPENAI_TIMEOUT_MS: "0" });

    expect(config.openAiTimeoutMs).toBe(100_000);
    expect(config.issues).toContainEqual({
      code: "INVALID_OPENAI_TIMEOUT_MS",
      field: "OPENAI_TIMEOUT_MS",
      message:
        "OPENAI_TIMEOUT_MS must be an integer from 1000 to 120000 milliseconds.",
    });
  });

  it("refuses the deterministic provider outside development", () => {
    const secretEnvironment = {
      OPENAI_API_KEY: "sk-not-used",
      AUTH_PUBLIC_ORIGIN: "https://education.example.test",
      AUTH_SESSION_SECRET: "s".repeat(40),
      AUTH_CREDENTIAL_KEY: Uint8Array.from({ length: 32 }, () => 3).toBase64(),
    };

    for (const appEnvironment of ["preview", "production"]) {
      const config = readServerConfig({
        ...secretEnvironment,
        APP_ENV: appEnvironment,
        AUTH_PROVIDER: "deterministic",
      });

      expect(config.auth.provider).toBe("supabase");
      expect(config.issues).toContainEqual({
        code: "INVALID_AUTH_PROVIDER",
        field: "AUTH_PROVIDER",
        message:
          "AUTH_PROVIDER=deterministic is available only when APP_ENV=development.",
      });
    }
  });

  it("selects the deterministic provider in development", () => {
    const config = readServerConfig({
      APP_ENV: "development",
      AUTH_PROVIDER: "deterministic",
    });

    expect(config.auth.provider).toBe("deterministic");
    expect(config.issues).not.toContainEqual(
      expect.objectContaining({ code: "INVALID_AUTH_PROVIDER" })
    );
  });

  it("rejects a non-HTTPS Supabase URL and a malformed key version", () => {
    const config = readServerConfig({
      APP_ENV: "development",
      SUPABASE_URL: "http://provider.example.test",
      AUTH_CREDENTIAL_KEY_VERSION: "1:2",
    });

    expect(config.issues.map((issue) => issue.code)).toStrictEqual(
      expect.arrayContaining(["INVALID_SUPABASE_URL", "INVALID_CREDENTIAL_KEY"])
    );
  });
});
