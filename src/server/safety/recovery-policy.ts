import type { RecoveryAction } from "@/shared/generation-contract";

/**
 * The one code-to-recovery table for issue #28. Unknown, executable, or untrusted payloads are replaced; bounded infrastructure failures are retried; every schema, identifier, relationship, or math break is edited.
 */
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

/**
 * The single priority order. A lesson-level refusal takes the strongest actionable recovery among its findings: retry, then replace, then edit.
 */
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

/**
 * A warning never blocks rendering, so it always asks for an edit; only a hard block reaches the structural replacement or infrastructure retry rule.
 */
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
