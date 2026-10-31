import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import {
  createIsomorphicFn,
  getGlobalStartContext,
} from "@tanstack/react-start";

import { routeTree } from "./routeTree.gen";
import { readCspNonce } from "./server/security-headers";

/**
 * #130: the middleware in `start.ts` mints one nonce per request. The router
 * needs it so `Scripts` and `HeadContent` stamp it on the inline hydration
 * bootstrap and on rendered styles. The client reads the same value back from
 * the `csp-nonce` meta tag.
 */
const requestCspNonce = createIsomorphicFn()
  .client((): string | undefined => undefined)
  .server((): string | undefined => readCspNonce(getGlobalStartContext()));

export const getRouter = () => {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    ssr: { nonce: requestCspNonce() },
  });
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
