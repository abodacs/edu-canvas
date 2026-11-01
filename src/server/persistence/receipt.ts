/**
One retry rule for every receipt-keyed write: fresh, replay, or conflict.
*/
export type ReceiptDecision =
  | { readonly outcome: "fresh" }
  | { readonly outcome: "replay"; readonly resultIds: readonly string[] }
  | { readonly outcome: "conflict" };

/**
The operation key names the attempt; the remaining input names the work.
Hashing the key too would make a legitimate retry look new.
*/
export const withoutOperationKey = (
  input: object
): Readonly<Record<string, unknown>> => {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== "operationKey")
  );
};

/**
`fresh` means run it, `replay` means return the stored identifiers, and
`conflict` means the same key was reused for different work.
*/
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
