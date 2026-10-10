/**
 * Failed sign-ins per client, in a sliding window kept in memory: after `maxFailures` within
 * `windowMs`, that client waits until its oldest failure leaves the window. A success clears it.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** How long until the next attempt is allowed; 0 when it already is. */
  retryAfterMs: number;
}

export interface LoginRateLimiter {
  check: (key: string, now: number) => RateLimitDecision;
  recordFailure: (key: string, now: number) => void;
  reset: (key: string) => void;
}

export interface LoginRateLimitOptions {
  maxFailures?: number;
  /** Clients tracked at once; past it the stalest are dropped so memory stays bounded. */
  maxKeys?: number;
  windowMs?: number;
}

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export function createLoginRateLimiter({
  maxFailures = LOGIN_MAX_FAILURES,
  maxKeys = 10_000,
  windowMs = LOGIN_WINDOW_MS,
}: LoginRateLimitOptions = {}): LoginRateLimiter {
  const failures = new Map<string, number[]>();

  const recent = (key: string, now: number): number[] => {
    const kept = (failures.get(key) ?? []).filter((at) => at > now - windowMs);
    if (kept.length === 0) failures.delete(key);
    else failures.set(key, kept);
    return kept;
  };

  return {
    check: (key, now) => {
      const kept = recent(key, now);
      if (kept.length < maxFailures) return { allowed: true, retryAfterMs: 0 };
      return { allowed: false, retryAfterMs: kept[kept.length - maxFailures] + windowMs - now };
    },
    recordFailure: (key, now) => {
      const kept = recent(key, now);
      // Re-inserting moves the key to the end, so the Map stays ordered by last failure.
      failures.delete(key);
      failures.set(key, [...kept, now]);

      if (failures.size > maxKeys) {
        for (const tracked of [...failures.keys()]) recent(tracked, now);
        for (const stalest of failures.keys()) {
          if (failures.size <= maxKeys) break;
          failures.delete(stalest);
        }
      }
    },
    reset: (key) => {
      failures.delete(key);
    },
  };
}
