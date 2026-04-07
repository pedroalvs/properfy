import { describe, it, expect, afterEach } from 'vitest';
import { SlidingWindowRateLimiter } from '../../../src/shared/infrastructure/sliding-window-rate-limiter';

describe('SlidingWindowRateLimiter', () => {
  let limiter: SlidingWindowRateLimiter;

  afterEach(() => {
    limiter?.destroy();
  });

  it('should allow requests up to the maximum', () => {
    limiter = new SlidingWindowRateLimiter({ maxRequests: 3, windowMs: 60_000, cleanupIntervalMs: 0 });
    const now = Date.now();
    expect(limiter.check('key-1', now).allowed).toBe(true);
    expect(limiter.check('key-1', now + 1).allowed).toBe(true);
    expect(limiter.check('key-1', now + 2).allowed).toBe(true);
  });

  it('should reject requests exceeding the maximum within the window', () => {
    limiter = new SlidingWindowRateLimiter({ maxRequests: 3, windowMs: 60_000, cleanupIntervalMs: 0 });
    const now = Date.now();
    limiter.check('key-1', now);
    limiter.check('key-1', now + 1);
    limiter.check('key-1', now + 2);
    const result = limiter.check('key-1', now + 3);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('should allow requests again after the window expires', () => {
    limiter = new SlidingWindowRateLimiter({ maxRequests: 2, windowMs: 1_000, cleanupIntervalMs: 0 });
    const now = Date.now();
    limiter.check('key-1', now);
    limiter.check('key-1', now + 100);
    // 3rd request within window — blocked
    expect(limiter.check('key-1', now + 200).allowed).toBe(false);
    // After window expires for the earliest entry
    expect(limiter.check('key-1', now + 1_001).allowed).toBe(true);
  });

  it('should track keys independently', () => {
    limiter = new SlidingWindowRateLimiter({ maxRequests: 1, windowMs: 60_000, cleanupIntervalMs: 0 });
    const now = Date.now();
    expect(limiter.check('session-a', now).allowed).toBe(true);
    expect(limiter.check('session-b', now).allowed).toBe(true);
    // session-a is now at its limit
    expect(limiter.check('session-a', now + 1).allowed).toBe(false);
    // session-b is also at its limit
    expect(limiter.check('session-b', now + 1).allowed).toBe(false);
  });

  it('should return retryAfterMs based on earliest timestamp in window', () => {
    limiter = new SlidingWindowRateLimiter({ maxRequests: 2, windowMs: 10_000, cleanupIntervalMs: 0 });
    const now = 1_000_000;
    limiter.check('k', now);
    limiter.check('k', now + 2_000);
    const result = limiter.check('k', now + 3_000);
    expect(result.allowed).toBe(false);
    // Earliest is at `now`, window is 10_000, so retry after now + 10_000 - (now+3_000) = 7_000
    expect(result.retryAfterMs).toBe(7_000);
  });

  it('should prune expired entries on check', () => {
    limiter = new SlidingWindowRateLimiter({ maxRequests: 2, windowMs: 1_000, cleanupIntervalMs: 0 });
    const now = Date.now();
    limiter.check('k', now);
    limiter.check('k', now + 100);
    // Both are expired well past the window
    const laterResult = limiter.check('k', now + 5_000);
    expect(laterResult.allowed).toBe(true);
  });

  // T201: 11th request within 5 min from the same session returns rate limit error
  it('T201: should reject the 11th request within 5 minutes for the same session', () => {
    limiter = new SlidingWindowRateLimiter({ maxRequests: 10, windowMs: 5 * 60 * 1_000, cleanupIntervalMs: 0 });
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      const result = limiter.check('session-1', now + i);
      expect(result.allowed).toBe(true);
    }
    const eleventhResult = limiter.check('session-1', now + 10);
    expect(eleventhResult.allowed).toBe(false);
    expect(eleventhResult.retryAfterMs).toBeGreaterThan(0);
  });

  // T202: per-session limits work independently from each other
  it('T202: should not block a different session when one session hits the limit', () => {
    limiter = new SlidingWindowRateLimiter({ maxRequests: 10, windowMs: 5 * 60 * 1_000, cleanupIntervalMs: 0 });
    const now = Date.now();
    // Exhaust session-a
    for (let i = 0; i < 10; i++) {
      limiter.check('session-a', now + i);
    }
    expect(limiter.check('session-a', now + 10).allowed).toBe(false);
    // session-b is unaffected
    expect(limiter.check('session-b', now + 10).allowed).toBe(true);
  });
});
