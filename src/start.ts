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

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

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
