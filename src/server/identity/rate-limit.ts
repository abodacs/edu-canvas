export interface RateLimitVerdict {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
}

interface Bucket {
  count: number;
  expiresAt: number;
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

// In-memory, process-local limiter (one Machine, AgDR-0007). A full table of live
// counters refuses the new key rather than evicting one: evicting would let an
// attacker clear a targeted account's throttle with enough distinct keys.
export const createRateLimiter = (
  options: RateLimiterOptions = {}
): RateLimiter => {
  const now = options.now ?? (() => Date.now());
  const maxBuckets = options.maxBuckets ?? defaultMaxBuckets;
  const buckets = new Map<string, Bucket>();

  const reclaimExpired = (timestamp: number): void => {
    for (const [candidate, bucket] of buckets) {
      if (timestamp >= bucket.expiresAt) {
        buckets.delete(candidate);
      }
    }
  };

  return {
    consume: (key, limit, windowMs) => {
      const timestamp = now();
      const existing = buckets.get(key);
      const isLive = existing !== undefined && timestamp < existing.expiresAt;

      if (isLive) {
        if (existing.count >= limit) {
          return {
            allowed: false,
            retryAfterMs: Math.max(0, existing.expiresAt - timestamp),
          };
        }

        existing.count += 1;
        return { allowed: true, retryAfterMs: 0 };
      }

      if (existing === undefined && buckets.size >= maxBuckets) {
        reclaimExpired(timestamp);
        if (buckets.size >= maxBuckets) {
          const oldest = buckets.values().next().value;
          return {
            allowed: false,
            retryAfterMs: Math.max(
              0,
              (oldest?.expiresAt ?? timestamp) - timestamp
            ),
          };
        }
      }

      buckets.delete(key);
      buckets.set(key, { count: 1, expiresAt: timestamp + windowMs });
      return { allowed: true, retryAfterMs: 0 };
    },
    reset: () => {
      buckets.clear();
    },
  };
};

// A stable, non-reversible digest for a rate-limit bucket key. Not cryptographic.
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

export const signInAccountLimit = 10;
export const signInAccountWindowMs = 15 * 60 * 1000;
export const sourceSignInLimit = 300;
export const signUpSourceLimit = 5;
export const signUpSourceWindowMs = 60 * 60 * 1000;
export const membershipAttemptLimit = 20;
export const membershipAttemptWindowMs = 5 * 60 * 1000;
