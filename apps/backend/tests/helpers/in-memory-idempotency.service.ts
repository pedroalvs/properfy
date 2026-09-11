import type {
  IIdempotencyService,
  IdempotencyAcquireResult,
  IdempotencyRecord,
} from '../../src/shared/domain/idempotency.service';

interface StoredRecord {
  response: unknown;
  payloadHash: string | null;
  ownerToken: string | null;
  inProgress: boolean;
}

/**
 * Real (in-process, Map-backed) implementation of `IIdempotencyService` for unit
 * tests that need to exercise the actual acquire/complete/release semantics —
 * as opposed to a fully mocked `IIdempotencyService` that only records call
 * arguments. Mirrors the production port's contract:
 *
 * - `tryAcquire` on a fresh key claims it (`acquired`); on an in-flight key
 *   returns `in_progress`; on a completed key returns the cached `response`.
 * - `complete` finalizes a claim only when the caller presents the matching
 *   `ownerToken` (the token returned by `tryAcquire`).
 * - `release` frees an in-flight claim, again only for the owning token.
 *
 * TTL is accepted but not enforced (tests run well under any real TTL).
 */
export class InMemoryIdempotencyService implements IIdempotencyService {
  private readonly store = new Map<string, StoredRecord>();

  private key(key: string, scope: string): string {
    return `${scope}::${key}`;
  }

  async get<T = unknown>(key: string, scope: string): Promise<T | null> {
    const record = this.store.get(this.key(key, scope));
    if (!record || record.inProgress) return null;
    return record.response as T;
  }

  async getWithHash<T = unknown>(key: string, scope: string): Promise<IdempotencyRecord<T> | null> {
    const record = this.store.get(this.key(key, scope));
    if (!record || record.inProgress) return null;
    return { response: record.response as T, payloadHash: record.payloadHash };
  }

  async tryAcquire<T = unknown>(
    key: string,
    scope: string,
    payloadHash: string,
  ): Promise<IdempotencyAcquireResult<T>> {
    const storeKey = this.key(key, scope);
    const existing = this.store.get(storeKey);

    if (!existing) {
      const ownerToken = `owner:${storeKey}:${this.store.size}:${Math.random().toString(36).slice(2)}`;
      this.store.set(storeKey, { response: undefined, payloadHash, ownerToken, inProgress: true });
      return { status: 'acquired', ownerToken };
    }

    if (existing.inProgress) {
      return { status: 'in_progress', payloadHash: existing.payloadHash };
    }

    return {
      status: 'completed',
      response: existing.response as T,
      payloadHash: existing.payloadHash,
    };
  }

  async complete<T = unknown>(
    key: string,
    scope: string,
    ownerToken: string,
    response: T,
    _ttlHours: number,
    payloadHash: string,
  ): Promise<boolean> {
    const storeKey = this.key(key, scope);
    const existing = this.store.get(storeKey);
    if (!existing || !existing.inProgress || existing.ownerToken !== ownerToken) {
      return false;
    }
    this.store.set(storeKey, { response, payloadHash, ownerToken, inProgress: false });
    return true;
  }

  async renew(key: string, scope: string, _payloadHash: string, ownerToken: string): Promise<boolean> {
    const existing = this.store.get(this.key(key, scope));
    return !!existing && existing.inProgress && existing.ownerToken === ownerToken;
  }

  async release(key: string, scope: string, _payloadHash: string, ownerToken: string): Promise<void> {
    const storeKey = this.key(key, scope);
    const existing = this.store.get(storeKey);
    if (existing && existing.inProgress && existing.ownerToken === ownerToken) {
      this.store.delete(storeKey);
    }
  }

  async set<T = unknown>(key: string, scope: string, response: T, _ttlHours: number, payloadHash?: string): Promise<void> {
    this.store.set(this.key(key, scope), {
      response,
      payloadHash: payloadHash ?? null,
      ownerToken: null,
      inProgress: false,
    });
  }

  /** Test helper: not part of the port — clears all stored claims. */
  clear(): void {
    this.store.clear();
  }
}
