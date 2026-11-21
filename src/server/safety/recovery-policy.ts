import type { RecoveryAction } from "@/shared/generation-contract";

const replacementCodes: ReadonlySet<string> = new Set([
  "EXECUTABLE_CONTENT",
  "UNTRUSTED_FIELD",
  "UNSAFE_CLAIM",
  "UNSAFE_PAYLOAD",
  "UNKNOWN_COMPONENT",
  "UNKNOWN_ACTION",
  "UNSUPPORTED_CATALOG",
  "UNSUPPORTED_CLAIM",
  "UNSUPPORTED_PROPERTY",
]);

const retryCodes: ReadonlySet<string> = new Set([
  "ARTIFACT_GATE_UNAVAILABLE",
  "SEMANTIC_VALIDATION_UNAVAILABLE",
  "VALIDATION_TIMEOUT",
  "VALIDATION_RETRY_EXHAUSTED",
  "GENERATION_CLAIM_EXPIRED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_RATE_LIMIT",
  "PROVIDER_UNAVAILABLE",
  "PREREQUISITE_PACK_MISSING",
  "PREREQUISITE_PATH_MISSING",
]);

export const recoveryPriority: Record<RecoveryAction, number> = {
  retry: 0,
  replace: 1,
  edit: 2,
};

export const recoveryForCode = (code: string): RecoveryAction => {
  if (retryCodes.has(code)) {
    return "retry";
  }
  return replacementCodes.has(code) ? "replace" : "edit";
};

export const recoveryForFinding = (
  code: string,
  verdict: "warning" | "hard_block"
): RecoveryAction => (verdict === "warning" ? "edit" : recoveryForCode(code));

export const dominantRecovery = (
  actions: Iterable<RecoveryAction>
): RecoveryAction | null => {
  let recovery: RecoveryAction | null = null;
  for (const candidate of actions) {
    if (!recovery || recoveryPriority[candidate] < recoveryPriority[recovery]) {
      recovery = candidate;
    }
  }
  return recovery;
};
