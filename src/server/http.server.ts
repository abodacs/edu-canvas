// Transport helpers shared by every server delivery module.

export const noStoreJson = (
  payload: unknown,
  status = 200,
  headers: HeadersInit = {}
): Response => {
  const merged = new Headers(headers);
  merged.set("cache-control", "no-store");
  return Response.json(payload, { status, headers: merged });
};

/**
 * A response with one `Set-Cookie` header per cookie. Joining them into one
 * value makes a browser read the second cookie as an attribute of the first,
 * so that cookie is never cleared. A `null` payload sends the status with no
 * body, which is what a 204 needs.
 */
export const responseWithCookies = (
  payload: unknown,
  cookies: readonly string[],
  status = 200,
  headers: HeadersInit = {}
): Response => {
  const merged = new Headers(headers);
  merged.set("cache-control", "no-store");
  for (const cookie of cookies) {
    merged.append("set-cookie", cookie);
  }
  return payload === null
    ? new Response(null, { status, headers: merged })
    : Response.json(payload, { status, headers: merged });
};

export const readJsonBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};
