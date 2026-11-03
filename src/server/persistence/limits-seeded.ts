import { generationLimitPolicy, minimumRetryAfterMs } from "../limits/config";
import { generationLeaseHolder } from "../limits/contract";
import {
  counterClaimsFor,
  leaseHolderFor,
  windowBounds,
} from "../limits/policy";
import type { GenerationLimitPolicy } from "../limits/config";
import type {
  ActiveGenerationLease,
  GenerationLimitStore,
  LeaseRelease,
  LimitCounter,
  LimitCounterClaim,
  LimitVerdict,
  ProviderCallReservation,
} from "../limits/contract";

interface SeededGenerationLimitStoreOptions {
  /**
  Test-only overrides. Production reads `generationLimitPolicy` directly.
  */
  readonly policy?: Partial<GenerationLimitPolicy>;
  readonly now?: () => number;
}

export interface SeededGenerationLimitSnapshot {
  readonly counters: readonly LimitCounter[];
  readonly leases: readonly ActiveGenerationLease[];
}

const counterKey = (
  tenantId: string,
  claim: LimitCounterClaim,
  windowStart: string
): string =>
  [tenantId, claim.scopeKind, claim.scopeId, claim.kind, windowStart].join("|");

const leaseKey = (tenantId: string, teacherId: string): string =>
  `${tenantId}|${teacherId}`;

// In-memory limit state for tests only. It mirrors the Postgres atomicity
// rule: check every claim and the lease first, then apply, so a rejected
// reservation leaves no partial increment.
export const createSeededGenerationLimitStore = (
  options: SeededGenerationLimitStoreOptions = {}
): GenerationLimitStore & {
  snapshot: () => SeededGenerationLimitSnapshot;
  reset: () => void;
} => {
  const policy: GenerationLimitPolicy = {
    ...generationLimitPolicy,
    ...options.policy,
  };
  const now = options.now ?? Date.now;
  const counters = new Map<string, LimitCounter>();
  const leases = new Map<string, ActiveGenerationLease>();

  const evaluate = (
    input: ProviderCallReservation
  ): { allowed: true } | { allowed: false; verdict: LimitVerdict } => {
    const nowMs = now();

    for (const claim of counterClaimsFor(input, policy)) {
      const bounds = windowBounds(claim.window, nowMs);
      const existing = counters.get(
        counterKey(input.tenantId, claim, bounds.windowStart)
      );
      if ((existing?.count ?? 0) >= claim.limit) {
        return {
          allowed: false,
          verdict: {
            allowed: false,
            retryAfterMs: bounds.retryAfterMs,
            limitedBy: {
              kind: claim.kind,
              scopeKind: claim.scopeKind,
              scopeId: claim.scopeId,
              window: claim.window,
            },
          },
        };
      }
    }

    if (!input.correction) {
      const existing = leases.get(leaseKey(input.tenantId, input.teacherId));
      if (existing && Date.parse(existing.expiresAt) > nowMs) {
        return {
          allowed: false,
          verdict: {
            allowed: false,
            retryAfterMs: Math.max(
              minimumRetryAfterMs,
              Date.parse(existing.expiresAt) - nowMs
            ),
            limitedBy: {
              kind: "active-generation",
              scopeKind: "teacher",
              scopeId: input.teacherId,
              window: "lease",
            },
          },
        };
      }
    }

    return { allowed: true };
  };

  const reserveProviderCall = (
    input: ProviderCallReservation
  ): Promise<LimitVerdict> => {
    const decision = evaluate(input);
    if (!decision.allowed) {
      return Promise.resolve(decision.verdict);
    }

    const nowMs = now();
    const nowDate = new Date(nowMs);
    const nowIso = nowDate.toISOString();
    for (const claim of counterClaimsFor(input, policy)) {
      const bounds = windowBounds(claim.window, nowMs);
      const key = counterKey(input.tenantId, claim, bounds.windowStart);
      const existing = counters.get(key);
      counters.set(key, {
        tenantId: input.tenantId,
        scopeKind: claim.scopeKind,
        scopeId: claim.scopeId,
        kind: claim.kind,
        window: claim.window,
        count: (existing?.count ?? 0) + 1,
        windowStart: bounds.windowStart,
        windowEnd: bounds.windowEnd,
      });
    }

    if (!input.correction) {
      const leaseExpiresAt = new Date(nowMs + Math.max(1, input.leaseTtlMs));
      leases.set(leaseKey(input.tenantId, input.teacherId), {
        tenantId: input.tenantId,
        teacherId: input.teacherId,
        holder: leaseHolderFor(input),
        acquiredAt: nowIso,
        expiresAt: leaseExpiresAt.toISOString(),
      });
    }

    return Promise.resolve({ allowed: true, retryAfterMs: 0 });
  };

  const releaseGenerationLease = (input: LeaseRelease): Promise<void> => {
    const key = leaseKey(input.tenantId, input.teacherId);
    const existing = leases.get(key);
    const holder = generationLeaseHolder(input.requestId, input.attemptNumber);
    if (existing?.holder === holder) {
      leases.delete(key);
    }
    return Promise.resolve();
  };

  return {
    reserveProviderCall,
    releaseGenerationLease,
    snapshot: () => {
      return {
        counters: counters.values().toArray(),
        leases: leases.values().toArray(),
      };
    },
    reset: () => {
      counters.clear();
      leases.clear();
    },
  };
};

// Test-support store with no practical ceiling. A suite that is not asserting
// limit behavior should not fail because it generated more than ten drafts,
// but it still exercises the same reservation code path.
export const createUnboundedGenerationLimitStore = () => {
  return createSeededGenerationLimitStore({
    policy: {
      teacherGenerationAttemptsPerHour: Number.MAX_SAFE_INTEGER,
      tenantGenerationAttemptsPerDay: Number.MAX_SAFE_INTEGER,
      tenantProviderCallsPerDay: Number.MAX_SAFE_INTEGER,
      sessionAuthoringRequestsPerMinute: Number.MAX_SAFE_INTEGER,
      activeGenerationsPerTeacher: Number.MAX_SAFE_INTEGER,
    },
  });
};
