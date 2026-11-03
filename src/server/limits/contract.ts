import type { LimitWindow } from "./config";

export const limitScopeKinds = ["teacher", "tenant", "session"] as const;
export type LimitScopeKind = (typeof limitScopeKinds)[number];

export const limitCounterKinds = [
  "generation-attempt",
  "provider-call",
  "authoring-request",
] as const;
export type LimitCounterKind = (typeof limitCounterKinds)[number];

/**
One counted thing: scope x kind x window. The counter is checked and incremented in the same conditional write, so a rejected request cannot leave a partial increment behind.
*/
export interface LimitCounterClaim {
  readonly scopeKind: LimitScopeKind;
  readonly scopeId: string;
  readonly kind: LimitCounterKind;
  readonly window: LimitWindow;
  readonly limit: number;
}

export interface LimitCounter {
  readonly tenantId: string;
  readonly scopeKind: LimitScopeKind;
  readonly scopeId: string;
  readonly kind: LimitCounterKind;
  readonly window: LimitWindow;
  readonly count: number;
  readonly windowStart: string;
  readonly windowEnd: string;
}

/**
At most one active generation per teacher. The holder names the attempt, so a worker that lost its claim cannot release someone else's lease. An expired lease is reclaimable; it is never a permanent lock.
*/
export interface ActiveGenerationLease {
  readonly tenantId: string;
  readonly teacherId: string;
  readonly holder: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
}

export interface ProviderCallReservation {
  readonly tenantId: string;
  readonly teacherId: string;
  readonly sessionId: string;
  readonly requestId: string;
  readonly attemptNumber: number;
  /**
  A correction is a second provider call inside one generation attempt. It counts against the provider-call budget but not the attempt or authoring budgets.
  */
  readonly correction: boolean;
  /**
  How long the lease stays reclaimable after a crash. The generation claim lease already owns this duration.
  */
  readonly leaseTtlMs: number;
}

export interface LeaseRelease {
  readonly tenantId: string;
  readonly teacherId: string;
  readonly requestId: string;
  readonly attemptNumber: number;
}

export interface LimitVerdict {
  readonly allowed: boolean;
  /**
  Zero when allowed. When limited, the wait until the window or lease really ends, so the 429 retry interval is honest rather than a fixed guess.
  */
  readonly retryAfterMs: number;
  readonly limitedBy?: {
    readonly kind: LimitCounterKind | "active-generation";
    readonly scopeKind: LimitScopeKind;
    readonly scopeId: string;
    readonly window: LimitWindow | "lease";
  };
}

export interface GenerationLimitStore {
  /**
  Atomically check every applicable counter and the active-generation lease, then increment and acquire. A limited verdict consumes nothing.
  */
  reserveProviderCall: (
    input: ProviderCallReservation
  ) => Promise<LimitVerdict>;
  /**
  Release only the lease held by this attempt. Missing or foreign leases are a no-op.
  */
  releaseGenerationLease: (input: LeaseRelease) => Promise<void>;
}

export const generationLeaseHolder = (
  requestId: string,
  attemptNumber: number
): string => `${requestId}:${attemptNumber}`;
