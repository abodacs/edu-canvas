import { afterAll, vi } from "vitest";

// Test files share workers (see vitest.config.ts), so undo the process-wide
// changes vitest knows how to undo before the next file runs.
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
