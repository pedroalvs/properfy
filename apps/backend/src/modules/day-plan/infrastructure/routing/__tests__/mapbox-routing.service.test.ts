import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MetricsCollector } from '../../../../../shared/infrastructure/metrics';
import type { IRoutingRateLimiter, RoutingRateBucket } from '../../../domain/routing-rate-limiter';
import { MapboxRoutingService } from '../mapbox-routing.service';

const TOKEN = 'pk.secret-token-value';

class FakeLimiter implements IRoutingRateLimiter {
  nextAcquire = true;
  acquired: Array<{ bucket: RoutingRateBucket; maxWaitMs: number }> = [];
  drained: RoutingRateBucket[] = [];
  async acquire(bucket: RoutingRateBucket, maxWaitMs: number): Promise<boolean> {
    this.acquired.push({ bucket, maxWaitMs });
    return this.nextAcquire;
  }
  async drain(bucket: RoutingRateBucket): Promise<void> {
    this.drained.push(bucket);
  }
}

function fakeLogger() {
  const logger: any = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    level: 'info',
  };
  logger.child = () => logger;
  return logger;
}

function makeService(opts?: { now?: Date }) {
  const limiter = new FakeLimiter();
  const logger = fakeLogger();
  const metrics = new MetricsCollector();
  const now = opts?.now ?? new Date('2026-11-04T20:00:00Z');
  const service = new MapboxRoutingService(TOKEN, {
    rateLimiter: limiter,
    logger,
    metrics,
    now: () => now,
  });
  return { service, limiter, logger, metrics };
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function errResponse(status: number, body: unknown = {}) {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

const P3 = [
  { lat: -33.87, lng: 151.2 },
  { lat: -33.88, lng: 151.21 },
  { lat: -33.89, lng: 151.22 },
];

const matrixBody = {
  code: 'Ok',
  durations: [
    [0, 600.4, 1200.6],
    [600.4, 0, 600.2],
    [1200.6, 600.2, 0],
  ],
  distances: [
    [0, 500.5, 1000.9],
    [500.5, 0, 500.1],
    [1000.9, 500.1, 0],
  ],
};

const directionsBody = {
  code: 'Ok',
  routes: [
    {
      duration: 662.7,
      distance: 540.3,
      geometry: {
        type: 'LineString',
        coordinates: [
          [151.2000004, -33.8700006],
          [151.2099996, -33.8799994],
        ],
      },
    },
  ],
};

describe('MapboxRoutingService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('matrix builds the driving-traffic URL with lng,lat 6dp and parses to integers (test 29)', async () => {
    const { service, limiter } = makeService();
    fetchMock.mockResolvedValueOnce(okResponse(matrixBody));

    const result = await service.matrix(P3);

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain(
      'https://api.mapbox.com/directions-matrix/v1/mapbox/driving-traffic/',
    );
    expect(url).toContain('151.200000,-33.870000;151.210000,-33.880000;151.220000,-33.890000');
    expect(url).toContain('annotations=duration,distance');
    expect(url).toContain(`access_token=${TOKEN}`);
    expect(result.provider).toBe('MAPBOX');
    expect(result.profile).toBe('driving-traffic');
    expect(result.durationsS[0]).toEqual([0, 600, 1201]);
    expect(result.distancesM[0]).toEqual([0, 501, 1001]);
    expect(result.nullPairs).toEqual([]);
    expect(limiter.acquired[0]!.bucket).toBe('matrix:driving-traffic');
  });

  it('matrix selects driving at 11 points and throws TOO_MANY_COORDINATES at 26 without fetch (test 30)', async () => {
    const { service } = makeService();
    fetchMock.mockResolvedValue(okResponse({ code: 'Ok', durations: [], distances: [] }));
    const p11 = Array.from({ length: 11 }, (_, i) => ({ lat: i, lng: i }));
    await service.matrix(p11);
    expect(fetchMock.mock.calls[0]![0]).toContain('/mapbox/driving/');

    fetchMock.mockClear();
    const { service: s2 } = makeService();
    const p26 = Array.from({ length: 26 }, (_, i) => ({ lat: i, lng: i }));
    await expect(s2.matrix(p26)).rejects.toMatchObject({ code: 'TOO_MANY_COORDINATES' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('matrix records null provider pairs in nullPairs (test 31)', async () => {
    const { service } = makeService();
    fetchMock.mockResolvedValueOnce(
      okResponse({
        code: 'Ok',
        durations: [
          [0, null],
          [null, 0],
        ],
        distances: [
          [0, null],
          [null, 0],
        ],
      }),
    );
    const result = await service.matrix([P3[0]!, P3[1]!]);
    expect(result.nullPairs).toContainEqual([0, 1]);
    expect(result.nullPairs).toContainEqual([1, 0]);
  });

  it('maps HTTP 429/401/500 and non-Ok body codes to typed errors (test 32)', async () => {
    for (const status of [429, 401, 500]) {
      const { service } = makeService();
      fetchMock.mockResolvedValueOnce(errResponse(status, { message: 'x' }));
      await expect(service.matrix(P3)).rejects.toMatchObject({ code: `HTTP_${status}` });
    }
    const { service } = makeService();
    fetchMock.mockResolvedValueOnce(okResponse({ code: 'InvalidInput', durations: [], distances: [] }));
    await expect(service.matrix(P3)).rejects.toMatchObject({ code: 'PROVIDER_CODE_InvalidInput' });
  });

  it('aborts the matrix fetch at 8000 ms -> TIMEOUT (test 33)', async () => {
    vi.useFakeTimers();
    const { service } = makeService();
    fetchMock.mockImplementationOnce(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const promise = service.matrix(P3);
    const assertion = expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
  });

  it('directions builds the v5 URL, sends depart_at only when >= now+60s, 5dp geometry (tests 34, 35, 36)', async () => {
    const now = new Date('2026-11-04T20:00:00Z');
    const { service } = makeService({ now });
    fetchMock.mockResolvedValue(okResponse(directionsBody));

    // departAt = now + 50 min, well beyond now+60s -> sent, seconds zeroed.
    const leg = await service.directions([P3[0]!, P3[1]!], {
      departAt: new Date('2026-11-04T20:50:30Z'),
    });
    let url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('https://api.mapbox.com/directions/v5/mapbox/driving-traffic/');
    expect(url).toContain('geometries=geojson');
    expect(url).toContain('overview=full');
    expect(url).toContain('steps=false');
    expect(url).toContain('depart_at=2026-11-04T20:50:00Z');
    expect(leg.durationS).toBe(663);
    expect(leg.distanceM).toBe(540);
    expect(leg.geometry.coordinates[0]).toEqual([151.2, -33.87]); // rounded to 5dp

    // departAt = now + 59s -> omitted.
    fetchMock.mockClear();
    await service.directions([P3[0]!, P3[1]!], { departAt: new Date('2026-11-04T20:00:59Z') });
    url = fetchMock.mock.calls[0]![0] as string;
    expect(url).not.toContain('depart_at=');

    // no departAt -> omitted.
    fetchMock.mockClear();
    await service.directions([P3[0]!, P3[1]!]);
    url = fetchMock.mock.calls[0]![0] as string;
    expect(url).not.toContain('depart_at=');
  });

  it('directions code NoRoute -> PROVIDER_CODE_NoRoute (test 36)', async () => {
    const { service } = makeService();
    fetchMock.mockResolvedValueOnce(okResponse({ code: 'NoRoute', routes: [] }));
    await expect(service.directions([P3[0]!, P3[1]!])).rejects.toMatchObject({
      code: 'PROVIDER_CODE_NoRoute',
    });
  });

  it('rate limiter: acquire false -> RATE_LIMITED without fetch; 429 drains the bucket (test 37)', async () => {
    const { service, limiter } = makeService();
    limiter.nextAcquire = false;
    await expect(service.matrix(P3)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(fetchMock).not.toHaveBeenCalled();

    const { service: s2, limiter: l2 } = makeService();
    fetchMock.mockResolvedValueOnce(errResponse(429, {}));
    await expect(s2.matrix(P3)).rejects.toMatchObject({ code: 'HTTP_429' });
    expect(l2.drained).toContain('matrix:driving-traffic');
  });

  it('circuit breaker opens after 5 failures; 6th is CIRCUIT_OPEN without fetch (test 38)', async () => {
    const { service } = makeService();
    fetchMock.mockResolvedValue(errResponse(500, {}));
    for (let i = 0; i < 5; i += 1) {
      await expect(service.matrix(P3)).rejects.toMatchObject({ code: 'HTTP_500' });
    }
    const callsBefore = fetchMock.mock.calls.length;
    await expect(service.matrix(P3)).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    expect(fetchMock.mock.calls.length).toBe(callsBefore); // no extra fetch
  });

  it('never logs or embeds the access token on any error path (test 39)', async () => {
    const paths: Array<() => Promise<unknown>> = [];
    const { service: s401, logger: l401 } = makeService();
    fetchMock.mockResolvedValueOnce(errResponse(401, { message: 'unauthorized' }));
    paths.push(async () => {
      let thrown: unknown;
      try {
        await s401.matrix(P3);
      } catch (e) {
        thrown = e;
      }
      expect(String((thrown as Error).message)).not.toContain(TOKEN);
      for (const call of [...l401.info.mock.calls, ...l401.warn.mock.calls, ...l401.error.mock.calls]) {
        expect(JSON.stringify(call)).not.toContain(TOKEN);
        expect(JSON.stringify(call)).not.toContain('access_token');
      }
    });
    for (const run of paths) await run();
  });

  it('logs routing.provider_call and increments metrics for OK and by-code failures (tests 40, 40b)', async () => {
    const { service, logger, metrics } = makeService();
    fetchMock.mockResolvedValueOnce(okResponse(matrixBody));
    await service.matrix(P3);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ api: 'matrix', profile: 'driving-traffic', outcome: 'OK' }),
      'routing.provider_call',
    );

    // 401, then 403, then timeout -> failuresByCode { HTTP_401:1, HTTP_403:1, TIMEOUT:1 }
    const svc = service;
    fetchMock.mockResolvedValueOnce(errResponse(401, {}));
    await expect(svc.matrix(P3)).rejects.toMatchObject({ code: 'HTTP_401' });
    fetchMock.mockResolvedValueOnce(errResponse(403, {}));
    await expect(svc.matrix(P3)).rejects.toMatchObject({ code: 'HTTP_403' });

    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const p = svc.matrix(P3);
    const a = expect(p).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(8000);
    await a;
    vi.useRealTimers();

    const snap = metrics.getSnapshot();
    expect(snap.routing?.providerFailuresByCode).toMatchObject({
      HTTP_401: 1,
      HTTP_403: 1,
      TIMEOUT: 1,
    });
  });
});
