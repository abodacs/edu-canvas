import { afterAll } from "vitest";

import { resetSharedRateLimiter } from "./server/identity/composition.server";

afterAll(() => {
  resetSharedRateLimiter();
});
