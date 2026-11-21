export const testServerEnvironment = {
  APP_ENV: "development",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/edu_canvas_test",
  META_API_KEY: "test-server-key",
} as const satisfies Record<string, string>;
