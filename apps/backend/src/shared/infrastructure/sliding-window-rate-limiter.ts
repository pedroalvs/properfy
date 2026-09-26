/**
 * In-memory sliding window rate limiter.
 *
 * Tracks timestamps of requests per key and rejects when the count within
 * the sliding window exceeds the configured maximum.
 *
 * Expired entries are pruned lazily on each `check()` call and periodically
 * via an optional cleanup interval to prevent memory leaks.
 */
export interface SlidingWindowRateLimiterOptions {
  /** Maximum number of requests allowed within the window. */
  maxRequests: number;
  /** Window size in milliseconds. */
  windowMs: number;
  /** How often to run full cleanup of expired keys (ms). Defaults to 60 000 (1 min). */
  cleanupIntervalMs?: number;
  /**
   * Hard ceiling on the number of distinct keys held at once. When a key is
   * limited by attacker-controlled input (e.g. the pre-lookup password-reset
   * throttle keyed by email), an adversary could otherwise accrete one Map
   * entry per unique value and exhaust memory. On overflow, expired keys are
   * pruned and then the oldest-inserted keys are evicted down to the cap.
   * Defaults to 100 000.
   */
  maxKeys?: number;
}

export class SlidingWindowRateLimiter {
  private readonly store = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SlidingWindowRateLimiterOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
    this.maxKeys = options.maxKeys ?? 100_000;

    const cleanupMs = options.cleanupIntervalMs ?? 60_000;
    if (cleanupMs > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), cleanupMs);
      // Allow the process to exit even if the timer is pending
      if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
        this.cleanupTimer.unref();
      }
    }
  }

  /**
   * Check whether the given key is within its rate limit.
   * If allowed, the request is recorded and `{ allowed: true }` is returned.
   * If denied, `{ allowed: false, retryAfterMs }` is returned.
   */
  check(key: string, now: number = Date.now()): { allowed: boolean; retryAfterMs?: number } {
    const cutoff = now - this.windowMs;
    let timestamps = this.store.get(key);

    if (timestamps) {
      // Prune expired entries for this key
      timestamps = timestamps.filter((t) => t > cutoff);
    } else {
      timestamps = [];
    }

    if (timestamps.length >= this.maxRequests) {
      // Earliest timestamp that is still in-window — caller must wait until it expires
      const earliest = timestamps[0]!;
      const retryAfterMs = earliest + this.windowMs - now;
      this.store.set(key, timestamps);
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1) };
    }

    const isNewKey = !this.store.has(key);
    timestamps.push(now);
    this.store.set(key, timestamps);
    if (isNewKey && this.store.size > this.maxKeys) {
      this.evictToCap();
    }
    return { allowed: true };
  }

  /**
   * Bound memory when the key space is attacker-controlled: prune fully-expired
   * keys first, then evict the oldest-inserted keys (Map preserves insertion
   * order) until back at the cap. The per-route/per-IP limiter in front keeps
   * this from being reachable in normal operation.
   */
  private evictToCap(): void {
    this.cleanup();
    if (this.store.size <= this.maxKeys) return;
    const overflow = this.store.size - this.maxKeys;
    let removed = 0;
    for (const key of this.store.keys()) {
      if (removed >= overflow) break;
      this.store.delete(key);
      removed++;
    }
  }

  /** Number of distinct keys currently tracked (primarily for tests/metrics). */
  get size(): number {
    return this.store.size;
  }

  /** Remove all entries whose timestamps have fully expired. */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of this.store) {
      const valid = timestamps.filter((t) => t > cutoff);
      if (valid.length === 0) {
        this.store.delete(key);
      } else {
        this.store.set(key, valid);
      }
    }
  }

  /** Stop the periodic cleanup timer and clear all state. */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }
}
