import { describe, expect, it } from "vitest";

import { createServerObservability } from "./observability.server";
import { readServerConfig } from "./config";
import { createFoundationPersistence } from "./persistence";
import type { ServerConfig } from "./config";

describe("foundation persistence boundary", () => {
  it("observes invalid configuration before refusing to create persistence", () => {
    const events: unknown[] = [];
    const observability = createServerObservability({
      logger: (event) => {
        events.push(event);
      },
      sentry: null,
    });
    const config = readServerConfig({
      APP_ENV: "production",
      DATABASE_URL: "not-a-url",
      OPENAI_API_KEY: "test-server-key",
      AUTH_PUBLIC_ORIGIN: "https://app.example.com",
      AUTH_SESSION_SECRET: "a-session-secret-that-is-long-enough",
      AUTH_CREDENTIAL_KEY: "ZWR1LWNhbnZhcy1kZXYta2V5LTAwMDAwMDAwMDAwMDA=",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "synthetic-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role-key",
    });

    expect(() =>
      createFoundationPersistence(config, { observability })
    ).toThrow("Cannot create persistence for invalid configuration.");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      operation: "persistence.create",
      context: {
        reason: "invalid_configuration",
        issueCodes: ["INVALID_DATABASE_URL"],
      },
    });
  });

  it("observes a missing database URL before refusing PostgreSQL persistence", () => {
    const events: unknown[] = [];
    const observability = createServerObservability({
      logger: (event) => {
        events.push(event);
      },
      sentry: null,
    });
    const config: ServerConfig = {
      appEnv: "production",
      syntheticDataOnly: true,
      persistenceAdapter: "postgres",
      openAiModel: "gpt-5.6",
      openAiBaseUrl: "https://api.openai.com/v1",
      openAiTimeoutMs: 100_000,
      auth: {
        provider: "supabase",
        publicOrigin: "https://app.example.com",
        sessionSecret: "a-session-secret-that-is-long-enough",
        credentialKey: Uint8Array.from({ length: 32 }, () => 1).toBase64(),
        credentialKeyVersion: "1",
      },
      issues: [],
    };

    expect(() =>
      createFoundationPersistence(config, { observability })
    ).toThrow("PostgreSQL persistence requires DATABASE_URL.");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      operation: "persistence.create",
      context: {
        reason: "missing_database_url",
        code: "DATABASE_REQUIRED",
      },
    });
  });
});
