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

export const cspNonceContextKey = "cspNonce";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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

export const readCspNonce = (context: unknown): string | undefined => {
  if (!isRecord(context)) {
    return undefined;
  }
  const nonce = context[cspNonceContextKey];
  return typeof nonce === "string" && nonce.length > 0 ? nonce : undefined;
};
