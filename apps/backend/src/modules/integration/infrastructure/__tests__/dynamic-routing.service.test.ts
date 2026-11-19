import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MetricsCollector } from '../../../../shared/infrastructure/metrics';
import type { IRoutingRateLimiter, RoutingRateBucket } from '../../../day-plan/domain/routing-rate-limiter';
import type { IntegrationConfigResolver } from '../integration-config-resolver';
import {
  DynamicRoutingService,
  type RoutingProviderMode,
} from '../dynamic-providers';

class AlwaysLimiter implements IRoutingRateLimiter {
  async acquire(_bucket: RoutingRateBucket, _maxWaitMs: number): Promise<boolean> {
    return true;
  }
  async drain(): Promise<void> {}
}

function fakeLogger() {
  const logger: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn(), trace: vi.fn() };
  logger.child = () => logger;
  return logger;
}

function makeResolver(configByCall: Array<{ accessToken: string } | null>) {
  let i = 0;
  return {
    async getConfig() {
      const cfg = configByCall[Math.min(i, configByCall.length - 1)] ?? null;
      i += 1;
      return cfg ? { provider: 'mapbox', source: 'database', config: cfg } : null;
    },
  } as unknown as IntegrationConfigResolver;
}

function makeService(
  resolver: IntegrationConfigResolver,
  providerMode: RoutingProviderMode = 'mapbox',
) {
  return new DynamicRoutingService(resolver, new AlwaysLimiter(), {
    logger: fakeLogger(),
    metrics: new MetricsCollector(),
    providerMode,
    now: () => new Date('2026-11-04T20:00:00Z'),
  });
}

const PTS = [
  { lat: -33.87, lng: 151.2 },
  { lat: -33.88, lng: 151.21 },
];

describe('DynamicRoutingService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('no mapbox config -> stub (no fetch); with config -> Mapbox (test 43)', async () => {
    const stubSvc = makeService(makeResolver([null]));
    const stubResult = await stubSvc.matrix(PTS);
    expect(stubResult.provider).toBe('STUB');
    expect(fetchMock).not.toHaveBeenCalled();

    const mapboxSvc = makeService(makeResolver([{ accessToken: 'hub-token' }]));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code: 'Ok', durations: [[0, 600], [600, 0]], distances: [[0, 500], [500, 0]] }),
    } as unknown as Response);
    const mapboxResult = await mapboxSvc.matrix(PTS);
    expect(mapboxResult.provider).toBe('MAPBOX');
    expect(fetchMock.mock.calls[0]![0]).toContain('access_token=hub-token');
  });

  it('uses the Integrations Hub token, not the env (test 43a)', async () => {
    const svc = makeService(makeResolver([{ accessToken: 'hub-token' }]));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code: 'Ok', durations: [[0, 1], [1, 0]], distances: [[0, 1], [1, 0]] }),
    } as unknown as Response);
    await svc.matrix(PTS);
    expect(fetchMock.mock.calls[0]![0]).toContain('access_token=hub-token');
  });

  it('kill switch stub ignores a present config and never fetches (test 43b)', async () => {
    const svc = makeService(makeResolver([{ accessToken: 'hub-token' }]), 'stub');
    const result = await svc.matrix(PTS);
    expect(result.provider).toBe('STUB');
    expect(fetchMock).not.toHaveBeenCalled();
    const leg = await svc.directions(PTS);
    expect(leg.provider).toBe('STUB');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caches the adapter per token: same token preserves the breaker, a new token resets it (test 43)', async () => {
    // Same token across calls -> one breaker: 5 x HTTP 500, then CIRCUIT_OPEN.
    const svc = makeService(makeResolver([{ accessToken: 'tok-1' }]));
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
    for (let i = 0; i < 5; i += 1) {
      await expect(svc.matrix(PTS)).rejects.toMatchObject({ code: 'HTTP_500' });
    }
    await expect(svc.matrix(PTS)).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });

    // A token change builds a fresh adapter (new breaker) -> fetch runs again.
    const svc2 = makeService(makeResolver([{ accessToken: 'tok-a' }, { accessToken: 'tok-b' }]));
    await expect(svc2.matrix(PTS)).rejects.toMatchObject({ code: 'HTTP_500' });
    const callsAfterA = fetchMock.mock.calls.length;
    await expect(svc2.matrix(PTS)).rejects.toMatchObject({ code: 'HTTP_500' });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterA); // new breaker, fetched again
  });

  it('no routing adapter source reads MAPBOX_ACCESS_TOKEN (test 43a / N5)', () => {
    const dir = join(__dirname, '../../../day-plan/infrastructure/routing');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf8');
      expect(content).not.toContain('MAPBOX_ACCESS_TOKEN');
    }
  });
});
