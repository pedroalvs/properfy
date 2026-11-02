import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_ROUTE_WEIGHTS } from '@properfy/shared';
import { MetricsCollector } from '../../../../../shared/infrastructure/metrics';
import {
  RoutingProviderError,
  RoutingDeferredError,
  type IRoutingService,
  type RoutePoint,
  type RoutingLeg,
  type RoutingMatrix,
} from '../../../domain/routing.service';
import { PlanRouteService, type PlanRouteInput, type PlanRouteStopInput } from '../plan-route.service';

function logger() {
  const l: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  l.child = () => l;
  return l;
}

// O, A, B, C on a line; line matrix matches TASK-F04-1 Example 1.
const O = { lat: -33.8, lng: 151.0 };
const A = { lat: -33.8, lng: 151.1 };
const B = { lat: -33.8, lng: 151.2 };
const C = { lat: -33.8, lng: 151.3 };
const LINE = [
  [0, 600, 1200, 1800],
  [600, 0, 600, 1200],
  [1200, 600, 0, 600],
  [1800, 1200, 600, 0],
];

class FakeRouting implements IRoutingService {
  matrixCalls = 0;
  directionsCalls: Array<{ from: RoutePoint; to: RoutePoint; departAt?: Date }> = [];
  matrixImpl: () => Promise<RoutingMatrix> = async () => ({
    provider: 'MAPBOX',
    profile: 'driving-traffic',
    durationsS: LINE.map((r) => [...r]),
    distancesM: LINE.map((r) => r.map((v) => v)),
    nullPairs: [],
  });
  legDurations = new Map<string, number>();

  async matrix(): Promise<RoutingMatrix> {
    this.matrixCalls += 1;
    return this.matrixImpl();
  }
  async directions(points: RoutePoint[], opts?: { departAt?: Date }): Promise<RoutingLeg> {
    const from = points[0]!;
    const to = points[points.length - 1]!;
    this.directionsCalls.push({ from, to, departAt: opts?.departAt });
    const key = `${from.lng}->${to.lng}`;
    const durationS = this.legDurations.get(key) ?? 600;
    return {
      provider: 'MAPBOX',
      durationS,
      distanceM: durationS * 10,
      geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [to.lng, to.lat]] },
    };
  }
}

function stop(id: string, loc: RoutePoint | null, win: [string, string], minutes = 45): PlanRouteStopInput {
  return {
    appointmentId: id,
    location: loc,
    windowStartAt: new Date(win[0]),
    windowEndAt: new Date(win[1]),
    serviceMinutes: minutes,
  };
}

const SYD_WINDOW: [string, string] = ['2026-11-04T21:00:00Z', '2026-11-05T06:00:00Z'];

function baseInput(over: Partial<PlanRouteInput> = {}): PlanRouteInput {
  return {
    origin: O,
    stops: [stop('A', A, SYD_WINDOW), stop('B', B, SYD_WINDOW), stop('C', C, SYD_WINDOW)],
    earliestDepartureAt: null,
    weights: DEFAULT_ROUTE_WEIGHTS,
    mode: { kind: 'OPTIMIZE' },
    interactive: true,
    strict: false,
    now: new Date('2026-11-04T19:00:00Z'),
    ...over,
  };
}

function make(fake: FakeRouting) {
  return new PlanRouteService(fake, logger(), new MetricsCollector());
}

describe('PlanRouteService', () => {
  it('Example 9: final Directions pass, per-leg depart_at, slack-corrected ETAs (tests 44, 54)', async () => {
    const fake = new FakeRouting();
    fake.legDurations.set('151->151.1', 660);
    fake.legDurations.set('151.1->151.2', 540);
    fake.legDurations.set('151.2->151.3', 600);

    const result = await make(fake).compute(baseInput());

    expect(result.order).toEqual(['A', 'B', 'C']);
    expect(result.approximate).toBe(false);
    // Directions depart_at: first = matrix departure (20:50), then the recomputed timeline.
    const departs = fake.directionsCalls.map((c) => c.departAt?.toISOString());
    expect(departs).toEqual([
      '2026-11-04T20:50:00.000Z',
      '2026-11-04T21:45:00.000Z',
      '2026-11-04T22:39:00.000Z',
    ]);
    expect(result.departureAt?.toISOString()).toBe('2026-11-04T20:49:00.000Z');
    expect(result.stops.map((s) => s.arrivalAt.toISOString())).toEqual([
      '2026-11-04T21:00:00.000Z',
      '2026-11-04T21:54:00.000Z',
      '2026-11-04T22:49:00.000Z',
    ]);
    expect(result.finishAt?.toISOString()).toBe('2026-11-04T23:34:00.000Z');
    expect(result.totals.driveS).toBe(1800);
    expect(result.geometry?.features).toHaveLength(3);
    expect(result.geometry?.features.map((f) => [f.properties.fromSequence, f.properties.toSequence])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    expect(result.usage).toEqual({ matrixElements: 16, directionsCalls: 3 });
  });

  it('identical consecutive points: 0 s leg, no Directions call, no geometry feature (test 44b)', async () => {
    const fake = new FakeRouting();
    fake.legDurations.set('151->151.1', 660);
    fake.legDurations.set('151.1->151.3', 600);
    // B shares A's coordinate.
    const input = baseInput({
      stops: [stop('A', A, SYD_WINDOW), stop('B', { ...A }, SYD_WINDOW), stop('C', C, SYD_WINDOW)],
    });
    const result = await make(fake).compute(input);

    expect(fake.directionsCalls).toHaveLength(2); // O->A and B->C only
    expect(result.usage.directionsCalls).toBe(2);
    expect(result.geometry?.features.map((f) => [f.properties.fromSequence, f.properties.toSequence])).toEqual([
      [0, 1],
      [2, 3],
    ]);
    const bStop = result.stops.find((s) => s.appointmentId === 'B')!;
    expect(bStop.travelS).toBe(0);
    expect(bStop.approximate).toBe(false);
  });

  it('matrix failure in interactive mode falls back to the stub and marks approximate (test 45)', async () => {
    const fake = new FakeRouting();
    fake.matrixImpl = async () => {
      throw new RoutingProviderError('HTTP_500', 'boom');
    };
    const result = await make(fake).compute(baseInput());
    expect(result.approximate).toBe(true);
    expect(result.approximateReason).toBe('PROVIDER_ERROR');
    expect(result.provider).toBe('STUB');
  });

  it('strict (job) mode defers on a rate-limited matrix instead of approximating (test 47)', async () => {
    const fake = new FakeRouting();
    fake.matrixImpl = async () => {
      throw new RoutingProviderError('RATE_LIMITED', 'slow down');
    };
    await expect(make(fake).compute(baseInput({ strict: true, interactive: false }))).rejects.toBeInstanceOf(
      RoutingDeferredError,
    );
  });

  it('0 stops makes no calls; 1 stop makes no Matrix call and 1 Directions with origin (test 48)', async () => {
    const empty = new FakeRouting();
    const emptyRes = await make(empty).compute(baseInput({ stops: [] }));
    expect(emptyRes.order).toEqual([]);
    expect(empty.matrixCalls).toBe(0);
    expect(empty.directionsCalls).toHaveLength(0);

    const one = new FakeRouting();
    await make(one).compute(baseInput({ stops: [stop('A', A, SYD_WINDOW)] }));
    expect(one.matrixCalls).toBe(0); // ordering not needed
    expect(one.directionsCalls).toHaveLength(1); // origin -> A

    const oneNoOrigin = new FakeRouting();
    await make(oneNoOrigin).compute(baseInput({ origin: null, stops: [stop('A', A, SYD_WINDOW)] }));
    expect(oneNoOrigin.matrixCalls).toBe(0);
    expect(oneNoOrigin.directionsCalls).toHaveLength(0);
  });

  it('FIXED_ORDER with a cached matrix calls no Matrix and keeps method FIXED (test 49)', async () => {
    const fake = new FakeRouting();
    const cached = {
      provider: 'MAPBOX' as const,
      profile: 'driving-traffic' as const,
      points: [
        { key: 'origin', ...O },
        { key: 'A', ...A },
        { key: 'B', ...B },
        { key: 'C', ...C },
      ],
      travelS: LINE.map((r) => [...r]),
    };
    const result = await make(fake).compute(
      baseInput({ mode: { kind: 'FIXED_ORDER', order: ['A', 'B', 'C'] }, cachedMatrix: cached }),
    );
    expect(fake.matrixCalls).toBe(0);
    expect(result.method).toBe('FIXED');
    expect(result.order).toEqual(['A', 'B', 'C']);
  });

  it('more than 25 coordinates uses the stub without a Matrix call (test 51)', async () => {
    const fake = new FakeRouting();
    const many = Array.from({ length: 26 }, (_, i) =>
      stop(`S${i}`, { lat: -33.8, lng: 151 + i * 0.01 }, SYD_WINDOW),
    );
    const result = await make(fake).compute(baseInput({ origin: null, stops: many }));
    expect(fake.matrixCalls).toBe(0);
    expect(result.approximate).toBe(true);
    expect(result.approximateReason).toBe('TOO_MANY_COORDINATES');
  });
});
