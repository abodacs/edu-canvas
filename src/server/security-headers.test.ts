import { describe, expect, it } from "vitest";

import {
  applySecurityHeaders,
  contentSecurityPolicy,
  createCspNonce,
  cspNonceContextKey,
  readCspNonce,
  securityHeaderClassForPath,
  securityHeadersFor,
} from "./security-headers";

const nonce = "0123456789abcdef0123456789abcdef";

describe(securityHeaderClassForPath, () => {
  it("treats page routes as documents", () => {
    expect(securityHeaderClassForPath("/")).toBe("document");
    expect(securityHeaderClassForPath("/login")).toBe("document");
    expect(securityHeaderClassForPath("/login/membership")).toBe("document");
    expect(securityHeaderClassForPath("/workspace")).toBe("document");
  });

  it("treats unknown paths as documents so a new page never loses its policy", () => {
    expect(securityHeaderClassForPath("/a-page-added-later")).toBe("document");
  });

  it("treats API routes as API responses", () => {
    expect(securityHeaderClassForPath("/api/health")).toBe("api");
    expect(securityHeaderClassForPath("/api/readiness")).toBe("api");
    expect(securityHeaderClassForPath("/api/lessons")).toBe("api");
    expect(securityHeaderClassForPath("/api/auth/session")).toBe("api");
  });

  it("treats the preview event stream as a stream", () => {
    expect(securityHeaderClassForPath("/api/a2ui/preview")).toBe("stream");
  });

  it("treats server function calls as API responses", () => {
    expect(securityHeaderClassForPath("/_serverFn/fetch-lesson")).toBe("api");
  });
});

describe(contentSecurityPolicy, () => {
  it("pins scripts and styles to the request nonce", () => {
    const policy = contentSecurityPolicy(nonce);

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain(`script-src 'self' 'nonce-${nonce}'`);
    expect(policy).toContain(`style-src 'self' 'nonce-${nonce}'`);
  });

  it("blocks plugin content, framing, and base rewrites", () => {
    const policy = contentSecurityPolicy(nonce);

    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
  });

  it("never allows inline script without a nonce", () => {
    expect(contentSecurityPolicy(nonce)).not.toContain("'unsafe-inline'");
    expect(contentSecurityPolicy(nonce)).not.toContain("'unsafe-eval'");
  });
});

describe(securityHeadersFor, () => {
  it("gives documents the full set including the nonce policy", () => {
    const headers = securityHeadersFor("/workspace", nonce);

    expect(headers).toStrictEqual({
      "content-security-policy": contentSecurityPolicy(nonce),
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    });
  });

  it("gives API responses the minimal set", () => {
    const headers = securityHeadersFor("/api/health", nonce);

    expect(headers).toStrictEqual({
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    });
  });

  it("gives the preview stream the API set so it keeps streaming", () => {
    expect(securityHeadersFor("/api/a2ui/preview", nonce)).toStrictEqual(
      securityHeadersFor("/api/health", nonce)
    );
  });
});

describe(createCspNonce, () => {
  it("returns 128 bits of hex", () => {
    expect(createCspNonce()).toMatch(/^[0-9a-f]{32}$/u);
  });

  it("returns a different value for each call", () => {
    const nonces = new Set(Array.from({ length: 100 }, () => createCspNonce()));

    expect(nonces.size).toBe(100);
  });
});

describe(readCspNonce, () => {
  it("reads the key the middleware writes", () => {
    expect(readCspNonce({ [cspNonceContextKey]: nonce })).toBe(nonce);
  });

  it("reads a nonce from the start request context", () => {
    expect(readCspNonce({ cspNonce: nonce })).toBe(nonce);
  });

  it("returns undefined when the context has no usable nonce", () => {
    expect(readCspNonce({})).toBeUndefined();
    expect(readCspNonce({ cspNonce: 5 })).toBeUndefined();
    expect(readCspNonce(null)).toBeUndefined();
    expect(readCspNonce(undefined)).toBeUndefined();
    expect(readCspNonce("cspNonce")).toBeUndefined();
  });
});

describe(applySecurityHeaders, () => {
  const headers = securityHeadersFor("/api/health", nonce);

  it("sets the class headers on a response and keeps the existing ones", () => {
    const response = Response.json(
      { status: "ok" },
      { headers: { "cache-control": "no-store" } }
    );

    applySecurityHeaders(response, headers);

    for (const [name, value] of Object.entries(headers)) {
      expect(response.headers.get(name)).toBe(value);
    }

    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("reaches the streaming response that the framework wraps", () => {
    const response = new Response(null, {
      headers: { "content-type": "text/event-stream" },
    });
    const wrapped = { response, serverSsrCleanup: "stream" };

    applySecurityHeaders(wrapped, headers);

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(wrapped.response).toBe(response);
  });

  it("leaves a response it cannot reach untouched", () => {
    expect(() => applySecurityHeaders(undefined, headers)).not.toThrow();
    expect(() =>
      applySecurityHeaders({ response: "not-a-response" }, headers)
    ).not.toThrow();
  });

  it("adds headers without replacing or consuming the stream body", async () => {
    const frame = "event: message\ndata: {}\n\n";
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(frame));
          controller.close();
        },
      }),
      { headers: { "content-type": "text/event-stream" } }
    );

    applySecurityHeaders(
      response,
      securityHeadersFor("/api/a2ui/preview", nonce)
    );

    const contentType = response.headers.get("content-type");

    expect(contentType).toBe("text/event-stream");
    await expect(response.text()).resolves.toBe(frame);
  });
});
