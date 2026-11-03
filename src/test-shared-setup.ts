import { afterAll } from "vitest";

import { resetSharedRateLimiter } from "./server/identity/composition.server";

// Only the shared project loads this file (see vitest.config.ts): isolated
// files get a fresh module graph anyway. The identity rate limiter is
// module-scoped, so its counters would otherwise accumulate across every
// shared file in the worker and rate-limit whichever file runs once the
// window fills.
afterAll(() => {
  resetSharedRateLimiter();
});
