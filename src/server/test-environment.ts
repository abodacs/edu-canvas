/**
Hermetic server environment for tests that read `process.env` or compose from
configuration. The database URL is never dialled: identity tests inject the
in-memory identity store through `buildConfiguredIdentity`, and the provider
key only satisfies configuration validation.
*/
export const testServerEnvironment = {
  APP_ENV: "development",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/edu_canvas_test",
  OPENAI_API_KEY: "test-server-key",
} as const satisfies Record<string, string>;
