import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import {
  createIsomorphicFn,
  getGlobalStartContext,
} from "@tanstack/react-start";

import { routeTree } from "./routeTree.gen";
import { readCspNonce } from "./server/security-headers";

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
