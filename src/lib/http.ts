export const readResponseJson = async (
  response: Response
): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

export const isJsonObject = (
  value: unknown
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
