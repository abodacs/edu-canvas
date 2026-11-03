import { generationLeaseHolder } from "./contract";
import { limitWindowMs, minimumRetryAfterMs } from "./config";
import type { LimitCounterClaim, ProviderCallReservation } from "./contract";
import type { GenerationLimitPolicy, LimitWindow } from "./config";

export interface WindowBounds {
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly retryAfterMs: number;
}

/**
UTC-aligned window boundaries. The bounds are derived from the store's clock, so two application instances agree on the window even when their process clocks drift a little.
*/
export const windowBounds = (
  window: LimitWindow,
  nowMs: number
): WindowBounds => {
  const size = limitWindowMs[window];
  const start = Math.floor(nowMs / size) * size;
  const end = start + size;
  const startDate = new Date(start);
  const endDate = new Date(end);
  return {
    windowStart: startDate.toISOString(),
    windowEnd: endDate.toISOString(),
    retryAfterMs: Math.max(minimumRetryAfterMs, end - nowMs),
  };
};

/**
The counters one provider call must reserve. A correction adds only a provider call; a first call adds the attempt and authoring budgets plus the lease.
*/
export const counterClaimsFor = (
  input: ProviderCallReservation,
  policy: GenerationLimitPolicy
): readonly LimitCounterClaim[] => {
  const claims: LimitCounterClaim[] = [
    {
      scopeKind: "tenant",
      scopeId: input.tenantId,
      kind: "provider-call",
      window: "day",
      limit: policy.tenantProviderCallsPerDay,
    },
  ];

  if (input.correction) {
    return claims;
  }

  claims.push(
    {
      scopeKind: "teacher",
      scopeId: input.teacherId,
      kind: "generation-attempt",
      window: "hour",
      limit: policy.teacherGenerationAttemptsPerHour,
    },
    {
      scopeKind: "tenant",
      scopeId: input.tenantId,
      kind: "generation-attempt",
      window: "day",
      limit: policy.tenantGenerationAttemptsPerDay,
    },
    {
      scopeKind: "session",
      scopeId: input.sessionId,
      kind: "authoring-request",
      window: "minute",
      limit: policy.sessionAuthoringRequestsPerMinute,
    }
  );

  return claims;
};

export const leaseHolderFor = (input: ProviderCallReservation): string =>
  generationLeaseHolder(input.requestId, input.attemptNumber);
