import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapboxGeocodingService } from './mapbox-geocoding.service';

type FetchResult = { ok: boolean; status: number; body: unknown };

function stubFetch(results: FetchResult | FetchResult[]): { urls: string[] } {
  const queue = Array.isArray(results) ? [...results] : null;
  const urls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    urls.push(url);
    const next = queue ? queue.shift() : (results as FetchResult);
    if (!next) throw new Error('fetch stub exhausted');
    const r = next;
    return {
      ok: r.ok,
      status: r.status,
      json: async () => r.body,
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { urls };
}

const OK = (body: unknown): FetchResult => ({ ok: true, status: 200, body });
const FOUND = OK({
  features: [{ center: [151.2, -33.8], relevance: 0.95, place_type: ['address'] }],
});

describe('MapboxGeocodingService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('1. sends permanent=true & limit=1 and maps center [lng,lat] → {lat,lng} with relevance + placeType', async () => {
    const { urls } = stubFetch(FOUND);
    const svc = new MapboxGeocodingService('tok');
    const result = await svc.geocode('A');
    expect(result).toEqual({ lat: -33.8, lng: 151.2, relevance: 0.95, placeType: 'address' });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('permanent=true');
    expect(urls[0]).toContain('limit=1');
    expect(urls[0]).toContain('/geocoding/v5/mapbox.places/A.json');
  });

  it('1b. carries the most specific place_type (first element) and relevance of a coarse result', async () => {
    stubFetch(OK({ features: [{ center: [151.2, -33.8], relevance: 0.6, place_type: ['postcode'] }] }));
    const svc = new MapboxGeocodingService('tok');
    const result = await svc.geocode('A');
    expect(result).toEqual({ lat: -33.8, lng: 151.2, relevance: 0.6, placeType: 'postcode', suburb: undefined });
  });

  it('1c. extracts the suburb from context — locality preferred over place', async () => {
    stubFetch(
      OK({
        features: [
          {
            center: [151.2, -33.8],
            relevance: 0.95,
            place_type: ['address'],
            context: [
              { id: 'neighborhood.1', text: 'Some Hood' },
              { id: 'locality.2', text: 'Chatswood' },
              { id: 'place.3', text: 'Sydney' },
              { id: 'postcode.4', text: '2067' },
            ],
          },
        ],
      }),
    );
    const svc = new MapboxGeocodingService('tok');
    const result = await svc.geocode('A');
    expect(result?.suburb).toBe('Chatswood');
  });

  it('1d. falls back to place when there is no locality context', async () => {
    stubFetch(
      OK({
        features: [
          { center: [151.2, -33.8], relevance: 0.9, place_type: ['address'], context: [{ id: 'place.3', text: 'Tilpa' }] },
        ],
      }),
    );
    const svc = new MapboxGeocodingService('tok');
    const result = await svc.geocode('A');
    expect(result?.suburb).toBe('Tilpa');
  });

  it('2. explicit permanent mode behaves like the default', async () => {
    const { urls } = stubFetch(FOUND);
    const svc = new MapboxGeocodingService('tok');
    await svc.geocode('A', { mode: 'permanent' });
    expect(urls[0]).toContain('permanent=true');
  });

  it('3. temporary mode omits the permanent parameter', async () => {
    const { urls } = stubFetch(FOUND);
    const svc = new MapboxGeocodingService('tok');
    await svc.geocode('A', { mode: 'temporary' });
    expect(urls[0]).not.toContain('permanent');
  });

  it('4. 403 + "permanent" message → account error, fetch called once', async () => {
    const { urls } = stubFetch({
      ok: false,
      status: 403,
      body: { message: 'Permanent geocodes are not enabled for this account' },
    });
    const svc = new MapboxGeocodingService('tok');
    await expect(svc.geocode('A')).rejects.toMatchObject({
      code: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE',
    });
    expect(urls).toHaveLength(1);
  });

  it('5. six consecutive account errors still carry the code (breaker does not open)', async () => {
    stubFetch(
      Array.from({ length: 6 }, () => ({
        ok: false,
        status: 403,
        body: { message: 'Permanent geocodes are not enabled for this account' },
      })),
    );
    const svc = new MapboxGeocodingService('tok');
    for (let i = 0; i < 6; i++) {
      await expect(svc.geocode('A')).rejects.toMatchObject({
        code: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE',
      });
    }
  });

  it('6. 500 → generic error with the status', async () => {
    stubFetch({ ok: false, status: 500, body: {} });
    const svc = new MapboxGeocodingService('tok');
    await expect(svc.geocode('A')).rejects.toThrow('Mapbox geocoding failed with status 500');
  });

  it('7. 401 without "permanent" → generic error (not account error)', async () => {
    stubFetch({ ok: false, status: 401, body: { message: 'Not Authorized - Invalid Token' } });
    const svc = new MapboxGeocodingService('tok');
    await expect(svc.geocode('A')).rejects.toThrow('Mapbox geocoding failed with status 401');
  });

  it('8. empty features → null', async () => {
    stubFetch(OK({ features: [] }));
    const svc = new MapboxGeocodingService('tok');
    await expect(svc.geocode('A')).resolves.toBeNull();
  });

  it('9. encodes & and # in the address', async () => {
    const { urls } = stubFetch(FOUND);
    const svc = new MapboxGeocodingService('tok');
    await svc.geocode('A&B#C');
    expect(urls[0]).toContain('A%26B%23C');
    expect(urls[0]).not.toContain('A&B#C');
  });

  it('10. 403 without "permanent" → account error (403 fallback, dec. 14)', async () => {
    stubFetch({ ok: false, status: 403, body: { message: 'Forbidden' } });
    const svc = new MapboxGeocodingService('tok');
    await expect(svc.geocode('A')).rejects.toMatchObject({
      code: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE',
    });
  });
});
