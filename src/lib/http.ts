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
