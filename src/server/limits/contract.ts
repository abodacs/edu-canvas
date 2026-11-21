import type { LimitWindow } from "./config";

export const limitScopeKinds = ["teacher", "tenant", "session"] as const;
export type LimitScopeKind = (typeof limitScopeKinds)[number];

export const limitCounterKinds = [
  "generation-attempt",
  "provider-call",
  "authoring-request",
] as const;
export type LimitCounterKind = (typeof limitCounterKinds)[number];

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
  readonly correction: boolean;
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
  readonly retryAfterMs: number;
  readonly limitedBy?: {
    readonly kind: LimitCounterKind | "active-generation";
    readonly scopeKind: LimitScopeKind;
    readonly scopeId: string;
    readonly window: LimitWindow | "lease";
  };
}

export interface GenerationLimitStore {
  reserveProviderCall: (
    input: ProviderCallReservation
  ) => Promise<LimitVerdict>;
  releaseGenerationLease: (input: LeaseRelease) => Promise<void>;
}

export const generationLeaseHolder = (
  requestId: string,
  attemptNumber: number
): string => `${requestId}:${attemptNumber}`;
