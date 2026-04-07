import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CachedAddressLookupService } from '../../../src/modules/property/infrastructure/cached-address-lookup.service';
import type {
  AddressLookupSuggestion,
  IAddressLookupService,
} from '../../../src/modules/property/domain/address-lookup.service';

function makeSuggestion(overrides: Partial<AddressLookupSuggestion> = {}): AddressLookupSuggestion {
  return {
    formattedAddress: '123 Test St, Sydney NSW 2000, Australia',
    street: '123 Test St',
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'AU',
    latitude: -33.8688,
    longitude: 151.2093,
    provider: 'MAPBOX',
    ...overrides,
  };
}

function createMockInner(results: AddressLookupSuggestion[] = [makeSuggestion()]): IAddressLookupService & { search: ReturnType<typeof vi.fn> } {
  return {
    search: vi.fn().mockResolvedValue(results),
  };
}

describe('CachedAddressLookupService', () => {
  let inner: ReturnType<typeof createMockInner>;
  let cached: CachedAddressLookupService;

  beforeEach(() => {
    inner = createMockInner();
    cached = new CachedAddressLookupService(inner, 300_000, 1000);
  });

  it('calls inner service on cache miss', async () => {
    const result = await cached.search('123 test st');

    expect(inner.search).toHaveBeenCalledOnce();
    expect(inner.search).toHaveBeenCalledWith('123 test st', undefined);
    expect(result).toHaveLength(1);
    expect(result[0].street).toBe('123 Test St');
  });

  it('returns cached result on cache hit within TTL', async () => {
    await cached.search('123 test st');
    const result = await cached.search('123 test st');

    expect(inner.search).toHaveBeenCalledOnce();
    expect(result).toHaveLength(1);
    expect(result[0].street).toBe('123 Test St');
  });

  it('normalizes query for cache key (case and whitespace)', async () => {
    await cached.search('  123 Test St  ');
    const result = await cached.search('123 test st');

    expect(inner.search).toHaveBeenCalledOnce();
    expect(result).toHaveLength(1);
  });

  it('calls inner service again when cache entry has expired', async () => {
    const shortTtl = new CachedAddressLookupService(inner, 50, 1000);

    await shortTtl.search('123 test st');
    expect(inner.search).toHaveBeenCalledOnce();

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    await shortTtl.search('123 test st');
    expect(inner.search).toHaveBeenCalledTimes(2);
  });

  it('stores separate cache entries for different queries', async () => {
    const suggestions1 = [makeSuggestion({ street: '123 First St' })];
    const suggestions2 = [makeSuggestion({ street: '456 Second St' })];

    inner.search
      .mockResolvedValueOnce(suggestions1)
      .mockResolvedValueOnce(suggestions2);

    const result1 = await cached.search('123 first st');
    const result2 = await cached.search('456 second st');

    expect(inner.search).toHaveBeenCalledTimes(2);
    expect(result1[0].street).toBe('123 First St');
    expect(result2[0].street).toBe('456 Second St');
  });

  it('stores separate cache entries for different country options', async () => {
    const suggestionsAU = [makeSuggestion({ country: 'AU' })];
    const suggestionsUS = [makeSuggestion({ country: 'US' })];

    inner.search
      .mockResolvedValueOnce(suggestionsAU)
      .mockResolvedValueOnce(suggestionsUS);

    const result1 = await cached.search('123 test st', { country: 'au' });
    const result2 = await cached.search('123 test st', { country: 'us' });

    expect(inner.search).toHaveBeenCalledTimes(2);
    expect(result1[0].country).toBe('AU');
    expect(result2[0].country).toBe('US');
  });

  it('stores separate cache entries for different limit options', async () => {
    inner.search
      .mockResolvedValueOnce([makeSuggestion()])
      .mockResolvedValueOnce([makeSuggestion(), makeSuggestion()]);

    const result1 = await cached.search('test', { limit: 1 });
    const result2 = await cached.search('test', { limit: 10 });

    expect(inner.search).toHaveBeenCalledTimes(2);
    expect(result1).toHaveLength(1);
    expect(result2).toHaveLength(2);
  });

  it('evicts oldest entry when max entries is exceeded', async () => {
    const smallCache = new CachedAddressLookupService(inner, 300_000, 3);

    await smallCache.search('query1');
    await smallCache.search('query2');
    await smallCache.search('query3');
    // Cache is now full (3 entries): [query1, query2, query3]
    // Next insert should evict oldest by insertion order (query1).
    await smallCache.search('query4');
    // Cache: [query2, query3, query4]

    // 4 unique queries = 4 calls to inner
    expect(inner.search).toHaveBeenCalledTimes(4);

    // query1 was evicted, so searching it again calls inner
    await smallCache.search('query1');
    expect(inner.search).toHaveBeenCalledTimes(5);
    // Cache after eviction of query2: [query3, query4, query1]

    // query3 should still be cached
    await smallCache.search('query3');
    expect(inner.search).toHaveBeenCalledTimes(5);

    // query4 should still be cached
    await smallCache.search('query4');
    expect(inner.search).toHaveBeenCalledTimes(5);
  });

  it('passes options through to inner service on cache miss', async () => {
    await cached.search('test query', { limit: 3, country: 'au' });

    expect(inner.search).toHaveBeenCalledWith('test query', { limit: 3, country: 'au' });
  });

  it('propagates errors from inner service without caching', async () => {
    inner.search.mockRejectedValueOnce(new Error('Mapbox down'));

    await expect(cached.search('test')).rejects.toThrow('Mapbox down');

    // Retry should call inner again (nothing cached)
    inner.search.mockResolvedValueOnce([makeSuggestion()]);
    const result = await cached.search('test');
    expect(result).toHaveLength(1);
    expect(inner.search).toHaveBeenCalledTimes(2);
  });
});
