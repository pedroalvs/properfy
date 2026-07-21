import { describe, it, expect, vi } from 'vitest';
import { ImportGeocodeVerifier } from './import-geocode-verifier';
import type { IGeocodingService, GeocodingResult } from '../../domain/geocoding.service';

function service(impl: (address: string) => Promise<GeocodingResult | null>) {
  return { geocode: vi.fn(impl) } satisfies IGeocodingService;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('ImportGeocodeVerifier', () => {
  it('returns an empty map for empty input without calling the service', async () => {
    const geocoding = service(async () => null);
    const verifier = new ImportGeocodeVerifier(geocoding);
    const result = await verifier.verifyMany(new Map());
    expect(result.size).toBe(0);
    expect(geocoding.geocode).not.toHaveBeenCalled();
  });

  it('maps coordinates to found and null to not_found', async () => {
    const geocoding = service(async (address) =>
      address.includes('Real St') ? { lat: -33.86, lng: 151.2 } : null,
    );
    const verifier = new ImportGeocodeVerifier(geocoding);
    const result = await verifier.verifyMany(
      new Map([
        ['key-a', '1 Real St, Sydney NSW 2000, Australia'],
        ['key-b', '9 Nowhere Rd, Atlantis'],
      ]),
    );
    expect(result.get('key-a')).toEqual({ status: 'found', lat: -33.86, lng: 151.2 });
    expect(result.get('key-b')).toEqual({ status: 'not_found', lat: null, lng: null });
  });

  it('marks a thrown geocode error as unverified without failing the batch', async () => {
    const geocoding = service(async (address) => {
      if (address.includes('boom')) throw new Error('circuit open');
      return { lat: 1, lng: 2 };
    });
    const verifier = new ImportGeocodeVerifier(geocoding);
    const result = await verifier.verifyMany(
      new Map([
        ['key-err', 'boom street'],
        ['key-ok', 'fine street'],
      ]),
    );
    expect(result.get('key-err')).toEqual({ status: 'unverified', lat: null, lng: null });
    expect(result.get('key-ok')).toEqual({ status: 'found', lat: 1, lng: 2 });
  });

  it('marks addresses exceeding the per-address timeout as unverified', async () => {
    const geocoding = service(async (address) => {
      if (address.includes('slow')) {
        await delay(100);
        return { lat: 1, lng: 2 };
      }
      return { lat: 3, lng: 4 };
    });
    const verifier = new ImportGeocodeVerifier(geocoding, { perAddressTimeoutMs: 20 });
    const result = await verifier.verifyMany(
      new Map([
        ['key-slow', 'slow street'],
        ['key-fast', 'fast street'],
      ]),
    );
    expect(result.get('key-slow')).toEqual({ status: 'unverified', lat: null, lng: null });
    expect(result.get('key-fast')).toEqual({ status: 'found', lat: 3, lng: 4 });
  });

  it('marks addresses beyond maxAddresses as unverified without calling the service for them', async () => {
    const geocoding = service(async () => ({ lat: 1, lng: 2 }));
    const verifier = new ImportGeocodeVerifier(geocoding, { maxAddresses: 2 });
    const result = await verifier.verifyMany(
      new Map([
        ['key-1', 'a'],
        ['key-2', 'b'],
        ['key-3', 'c'],
      ]),
    );
    expect(geocoding.geocode).toHaveBeenCalledTimes(2);
    expect(result.get('key-1')).toEqual({ status: 'found', lat: 1, lng: 2 });
    expect(result.get('key-2')).toEqual({ status: 'found', lat: 1, lng: 2 });
    expect(result.get('key-3')).toEqual({ status: 'unverified', lat: null, lng: null });
  });

  it('marks the tail as unverified once the overall budget is exhausted', async () => {
    const geocoding = service(async () => {
      await delay(30);
      return { lat: 1, lng: 2 };
    });
    const verifier = new ImportGeocodeVerifier(geocoding, {
      concurrency: 1,
      overallBudgetMs: 40,
      perAddressTimeoutMs: 1000,
    });
    const result = await verifier.verifyMany(
      new Map([
        ['key-1', 'a'],
        ['key-2', 'b'],
        ['key-3', 'c'],
        ['key-4', 'd'],
      ]),
    );
    expect(result.get('key-1')).toEqual({ status: 'found', lat: 1, lng: 2 });
    expect(result.get('key-4')).toEqual({ status: 'unverified', lat: null, lng: null });
    // Every address still gets an answer.
    expect(result.size).toBe(4);
    expect(geocoding.geocode.mock.calls.length).toBeLessThan(4);
  });

  it('never runs more than `concurrency` lookups at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const geocoding = service(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(10);
      inFlight -= 1;
      return { lat: 1, lng: 2 };
    });
    const verifier = new ImportGeocodeVerifier(geocoding, { concurrency: 2 });
    await verifier.verifyMany(
      new Map(Array.from({ length: 8 }, (_, i) => [`key-${i}`, `address ${i}`] as const)),
    );
    expect(maxInFlight).toBe(2);
    expect(geocoding.geocode).toHaveBeenCalledTimes(8);
  });
});
