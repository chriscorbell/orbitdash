import { describe, expect, it } from "bun:test";
import { createLoginRateLimiter, LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS } from "./rate-limit";

const MINUTE = 60_000;

describe("login rate limiter", () => {
  it("allows 5 failures per 15 minutes by default, then blocks", () => {
    const limiter = createLoginRateLimiter();
    expect(LOGIN_MAX_FAILURES).toBe(5);
    expect(LOGIN_WINDOW_MS).toBe(15 * MINUTE);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(limiter.check("1.2.3.4", attempt * MINUTE).allowed).toBe(true);
      limiter.recordFailure("1.2.3.4", attempt * MINUTE);
    }

    expect(limiter.check("1.2.3.4", 5 * MINUTE)).toEqual({
      allowed: false,
      retryAfterMs: 10 * MINUTE,
    });
  });

  it("lets one attempt through as each failure leaves the window", () => {
    const limiter = createLoginRateLimiter({ maxFailures: 2, windowMs: 10 * MINUTE });
    limiter.recordFailure("a", 0);
    limiter.recordFailure("a", 4 * MINUTE);

    expect(limiter.check("a", 9 * MINUTE)).toEqual({ allowed: false, retryAfterMs: MINUTE });
    expect(limiter.check("a", 10 * MINUTE).allowed).toBe(true);
    limiter.recordFailure("a", 10 * MINUTE);
    expect(limiter.check("a", 11 * MINUTE)).toEqual({ allowed: false, retryAfterMs: 3 * MINUTE });
    expect(limiter.check("a", 30 * MINUTE)).toEqual({ allowed: true, retryAfterMs: 0 });
  });

  it("keeps clients apart and clears a client on reset", () => {
    const limiter = createLoginRateLimiter({ maxFailures: 1 });
    limiter.recordFailure("a", 0);

    expect(limiter.check("a", 1).allowed).toBe(false);
    expect(limiter.check("b", 1).allowed).toBe(true);

    limiter.reset("a");
    expect(limiter.check("a", 2).allowed).toBe(true);
  });

  it("drops expired clients first, then the stalest, when tracking too many", () => {
    const limiter = createLoginRateLimiter({ maxFailures: 1, maxKeys: 2, windowMs: 10 });
    limiter.recordFailure("old", 0);
    limiter.recordFailure("a", 20);
    limiter.recordFailure("b", 21);
    // "old" expired, so it went first and both recent clients are still tracked.
    expect(limiter.check("a", 22).allowed).toBe(false);
    expect(limiter.check("b", 22).allowed).toBe(false);

    limiter.recordFailure("c", 23);
    expect(limiter.check("a", 24).allowed).toBe(true);
    expect(limiter.check("b", 24).allowed).toBe(false);
    expect(limiter.check("c", 24).allowed).toBe(false);
  });
});
