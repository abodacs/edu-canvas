/**
A response body as JSON, or `undefined` when the body is empty or malformed, so
a caller reports one contract failure instead of an exception.
*/
export const readResponseJson = async (
  response: Response
): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

/**
Narrow an unknown JSON payload to an object record without asserting any field shape; callers read and type-check the fields they consume.
*/
export const isJsonObject = (
  value: unknown
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
