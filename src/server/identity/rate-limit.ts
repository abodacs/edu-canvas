export interface RateLimitVerdict {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
}

interface Bucket {
  count: number;
  windowStartedAt: number;
}

export interface RateLimiterOptions {
  /**
  Injectable clock for deterministic tests.
  */
  readonly now?: () => number;
  readonly maxBuckets?: number;
}

export interface RateLimiter {
  /**
   * Consume one attempt from `key`. Atomic per key. Once `key` reaches `limit`
   * inside `windowMs`, further attempts are rejected with a bounded retry hint.
   * Counters are time-limited: the window resets, so no permanent lock exists.
   */
  readonly consume: (
    key: string,
    limit: number,
    windowMs: number
  ) => RateLimitVerdict;
  /**
  Reset every counter. Test-only.
  */
  readonly reset: () => void;
}

const defaultMaxBuckets = 10_000;

/**
 * In-memory, process-local limiter. Bounded key space prevents unbounded growth.
 * The release model runs one Machine (AgDR-0007), so a process-local limiter is
 * the current authority; the interface keeps a shared store swappable later.
 */
export const createRateLimiter = (
  options: RateLimiterOptions = {}
): RateLimiter => {
  const now = options.now ?? (() => Date.now());
  const maxBuckets = options.maxBuckets ?? defaultMaxBuckets;
  const buckets = new Map<string, Bucket>();

  const evictOldest = (): void => {
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) {
      buckets.delete(oldest);
    }
  };

  return {
    consume: (key, limit, windowMs) => {
      const timestamp = now();
      const existing = buckets.get(key);

      if (!existing || timestamp - existing.windowStartedAt >= windowMs) {
        if (!existing && buckets.size >= maxBuckets) {
          evictOldest();
        }
        buckets.delete(key);
        buckets.set(key, { count: 1, windowStartedAt: timestamp });
        return { allowed: true, retryAfterMs: 0 };
      }

      if (existing.count >= limit) {
        return {
          allowed: false,
          retryAfterMs: Math.max(
            0,
            existing.windowStartedAt + windowMs - timestamp
          ),
        };
      }

      existing.count += 1;
      return { allowed: true, retryAfterMs: 0 };
    },
    reset: () => {
      buckets.clear();
    },
  };
};

/**
 * A stable, non-reversible digest for a rate-limit key. Raw account identifiers and client addresses are never logged or stored as bucket keys.
 */
export const rateLimitKey = (namespace: string, secret: string): string =>
  `${namespace}:${secret}`;

export const normalizedAccountDigest = (
  secret: string,
  email: string
): string => {
  // FNV-1a over the normalized address; not cryptographic, only for bucketing.
  const normalized = email.trim().toLowerCase();
  let hash = 2_166_136_261;
  const digestInput = `${secret}:${normalized}`;
  for (const character of digestInput) {
    // eslint-disable-next-line no-bitwise -- FNV-1a mixing step.
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return Math.abs(hash).toString(36);
};

export const signInAttemptLimit = 10;
export const signInAttemptWindowMs = 15 * 60 * 1000;
export const sourceSignInLimit = 300;
export const signUpSourceLimit = 5;
export const signUpSourceWindowMs = 60 * 60 * 1000;
export const membershipAttemptLimit = 20;
export const membershipAttemptWindowMs = 5 * 60 * 1000;
