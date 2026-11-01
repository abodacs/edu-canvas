/**
One retry rule for every receipt-keyed write.

A receipt says: this operation key already ran with this input, and produced
these identifiers. Two stores keep receipts for two different reasons — the pack
rows a teacher publishes, and the record commands the learner runtime reads —
but the decision is the same in both, so it lives here once.

The hash itself stays with each store: publication hashes through
`createCanonicalHash`, records through the versioned `createInputHash`. Changing
that would invalidate every receipt already stored.
*/
export type ReceiptDecision =
  | { readonly outcome: "fresh" }
  | { readonly outcome: "replay"; readonly resultIds: readonly string[] }
  | { readonly outcome: "conflict" };

/**
The operation key identifies the attempt; the remaining input identifies what it
was asked to do. Hashing the key too would make a legitimate retry look new.
*/
export const withoutOperationKey = (
  input: object
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== "operationKey")
  );

/**
`fresh` means run it. `replay` means return the stored identifiers. `conflict`
means the same key was reused for different work, which is a caller bug, not a
retry.
*/
export const decideReceipt = (
  stored:
    | Readonly<{ inputHash: string; resultIds: readonly string[] }>
    | undefined,
  incomingInputHash: string
): ReceiptDecision => {
  if (!stored) {
    return { outcome: "fresh" };
  }
  if (stored.inputHash !== incomingInputHash) {
    return { outcome: "conflict" };
  }
  return { outcome: "replay", resultIds: stored.resultIds };
};
