// Baseline security response headers (#130).
//
// One policy, applied once at the HTTP edge (`src/start.ts`). The response
// class comes from the request path, so every route inherits the same set
// without repeating it, and a route added later is a document by default.

export type SecurityHeaderClass = "api" | "document" | "stream";

const previewPath = "/api/a2ui/preview";
const apiPrefix = "/api/";
const serverFunctionPrefix = "/_serverFn/";

export const securityHeaderClassForPath = (
  pathname: string
): SecurityHeaderClass => {
  if (pathname === previewPath) {
    return "stream";
  }
  return pathname.startsWith(apiPrefix) ||
    pathname.startsWith(serverFunctionPrefix)
    ? "api"
    : "document";
};

const nonceByteLength = 16;
const hexRadix = 16;
const hexPadLength = 2;

export const createCspNonce = (): string => {
  const bytes = new Uint8Array(nonceByteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) =>
    byte.toString(hexRadix).padStart(hexPadLength, "0")
  ).join("");
};

/**
 * Documents run the app, so scripts and styles are pinned to this request's nonce. Start renders its hydration bootstrap inline, and the nonce is what keeps it legal.
 */
export const contentSecurityPolicy = (nonce: string): string => {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
};

/**
 * A response that is not a document renders nothing, so it needs no source
 * allowance. `frame-ancestors` still denies embedding the payload.
 */
const embeddedContentSecurityPolicy =
  "default-src 'none'; frame-ancestors 'none'";

const permissionsPolicy = "camera=(), microphone=(), geolocation=()";

const baseHeaders = {
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

export const securityHeadersFor = (
  pathname: string,
  nonce: string
): Record<string, string> => {
  if (securityHeaderClassForPath(pathname) !== "document") {
    return {
      ...baseHeaders,
      "content-security-policy": embeddedContentSecurityPolicy,
    };
  }
  return {
    ...baseHeaders,
    "content-security-policy": contentSecurityPolicy(nonce),
    "permissions-policy": permissionsPolicy,
  };
};

/**
 * The one key the middleware writes and the router reads, so a rename cannot silently stop the nonce from reaching the rendered document.
 */
export const cspNonceContextKey = "cspNonce";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * The framework hands middleware either a `Response` or the SSR wrapper that
 * carries it, so unwrap before writing. The wrapper keeps its identity and its
 * stream cleanup.
 */
const responseOfMiddlewareResult = (
  middlewareResult: unknown
): Response | undefined => {
  if (middlewareResult instanceof Response) {
    return middlewareResult;
  }
  return isRecord(middlewareResult) &&
    middlewareResult.response instanceof Response
    ? middlewareResult.response
    : undefined;
};

/**
 * Writes the class headers onto the response the framework produced. A shape this cannot reach is left untouched on purpose: headers are the second layer behind the A2UI catalog, so degrading them must never turn a served response into a failure.
 */
export const applySecurityHeaders = (
  middlewareResult: unknown,
  headers: Record<string, string>
): void => {
  const response = responseOfMiddlewareResult(middlewareResult);
  if (!response) {
    return;
  }
  for (const [name, headerValue] of Object.entries(headers)) {
    response.headers.set(name, headerValue);
  }
};

/**
 * `getGlobalStartContext()` is untyped framework data at this seam, so narrow
 * it here instead of trusting a cast in `src/router.tsx`.
 */
export const readCspNonce = (context: unknown): string | undefined => {
  if (!isRecord(context)) {
    return undefined;
  }
  const nonce = context[cspNonceContextKey];
  return typeof nonce === "string" && nonce.length > 0 ? nonce : undefined;
};
