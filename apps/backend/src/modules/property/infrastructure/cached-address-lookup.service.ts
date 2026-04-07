import type {
  AddressLookupSuggestion,
  IAddressLookupService,
} from '../domain/address-lookup.service';

interface CacheEntry {
  result: AddressLookupSuggestion[];
  expiresAt: number;
}

export class CachedAddressLookupService implements IAddressLookupService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly inner: IAddressLookupService,
    private readonly ttlMs: number = 300_000,
    private readonly maxEntries: number = 1000,
  ) {}

  async search(
    query: string,
    options?: { limit?: number; country?: string },
  ): Promise<AddressLookupSuggestion[]> {
    const key = this.cacheKey(query, options?.country, options?.limit);
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    // Delete expired entry so insertion order is refreshed
    if (cached) {
      this.cache.delete(key);
    }

    const result = await this.inner.search(query, options);

    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.ttlMs,
    });

    if (this.cache.size > this.maxEntries) {
      this.evictOldest();
    }

    return result;
  }

  private cacheKey(
    query: string,
    country?: string,
    limit?: number,
  ): string {
    const normalizedQuery = query.toLowerCase().trim();
    const normalizedCountry = country?.toLowerCase().trim() ?? '';
    const normalizedLimit = limit ?? 5;
    return `${normalizedQuery}|${normalizedCountry}|${normalizedLimit}`;
  }

  /** Evict the oldest entry by Map insertion order (first key). */
  private evictOldest(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
    }
  }
}
