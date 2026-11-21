export type ReceiptDecision =
  | { readonly outcome: "fresh" }
  | { readonly outcome: "replay"; readonly resultIds: readonly string[] }
  | { readonly outcome: "conflict" };

export const withoutOperationKey = (
  input: object
): Readonly<Record<string, unknown>> => {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== "operationKey")
  );
};

export const decideReceipt = (
  stored:
    Readonly<{ inputHash: string; resultIds: readonly string[] }> | undefined,
  incomingInputHash: string
): ReceiptDecision => {
  if (!stored) {
    return { outcome: "fresh" };
  }
  return stored.inputHash === incomingInputHash
    ? { outcome: "replay", resultIds: stored.resultIds }
    : { outcome: "conflict" };
};
