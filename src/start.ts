import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";

import {
  applySecurityHeaders,
  createCspNonce,
  cspNonceContextKey,
  securityHeadersFor,
} from "./server/security-headers";

/**
 * Adding `src/start.ts` replaces Start's default middleware list, so the
 * default CSRF filter has to be repeated here or server functions lose it.
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

/**
 * The single edge for security headers (#130). The nonce is minted before the
 * document renders so the router can stamp it on the inline hydration
 * bootstrap, and it reaches the router through the request context.
 */
const securityHeadersMiddleware = createMiddleware().server(
  async ({ next: continueRequest, pathname }) => {
    const nonce = createCspNonce();
    const result = await continueRequest({
      context: { [cspNonceContextKey]: nonce },
    });

    applySecurityHeaders(result.response, securityHeadersFor(pathname, nonce));

    return result;
  }
);

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [csrfMiddleware, securityHeadersMiddleware],
  };
});
