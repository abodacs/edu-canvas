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

// Set-Cookie cannot be folded: two cookies must become two headers.
export const withSetCookies = (
  cookies: readonly string[],
  headers: HeadersInit = {}
): Headers => {
  const merged = new Headers(headers);
  for (const cookie of cookies) {
    merged.append("set-cookie", cookie);
  }
  return merged;
};

export const readJsonBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};
