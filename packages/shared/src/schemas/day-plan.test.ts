import { describe, it, expect } from 'vitest';
import {
  buildLegOverrides,
  toOptimizerInput,
  previewDayPlanOrderRequestSchema,
  previewDayPlanOrderResponseSchema,
  DAY_PLAN_MAX_STOPS_PER_ORDER,
  type DayPlanResponse,
  type DayPlanRoutingInput,
} from './day-plan';

const routingInput: DayPlanRoutingInput = {
  points: [
    { key: 'origin', lat: -33.87, lng: 151.2 },
    { key: 'A', lat: -33.88, lng: 151.21 },
    { key: 'B', lat: -33.9, lng: 151.1 },
  ],
  travelS: [
    [0, 600, 900],
    [600, 0, 500],
    [900, 500, 0],
  ],
  originKey: 'origin',
  earliestDepartureAt: null,
  weights: { travel: 1, windowWait: 1, baseProximity: 1 },
  legTravelS: [
    { fromKey: 'origin', toKey: 'A', travelS: 610 },
    { fromKey: 'A', toKey: 'B', travelS: 520 },
  ],
};

describe('buildLegOverrides', () => {
  it('uses stored Directions legs for pairs that already existed, null for new pairs', () => {
    // Saved order origin→A→B. Proposed order [A, B] reuses origin→A? No: first leg is origin→A (stored),
    // then A→B (stored).
    expect(buildLegOverrides(['A', 'B'], routingInput)).toEqual([610, 520]);
    // Proposed order [B, A]: origin→B (new) then B→A (new) → both fall back to the matrix.
    expect(buildLegOverrides(['B', 'A'], routingInput)).toEqual([null, null]);
  });

  it('returns all-null when there is no routingInput', () => {
    expect(buildLegOverrides(['A', 'B'], null)).toEqual([null, null]);
  });
});

describe('toOptimizerInput', () => {
  const plan = {
    date: '2026-11-05',
    stops: [
      { appointmentId: 'A', executed: false, lat: -33.88, lng: 151.21, durationMinutes: 45, windowStartAt: '2026-11-04T21:00:00.000Z', windowEndAt: '2026-11-05T06:00:00.000Z' },
      { appointmentId: 'B', executed: false, lat: -33.9, lng: 151.1, durationMinutes: 30, windowStartAt: '2026-11-04T22:00:00.000Z', windowEndAt: '2026-11-05T05:00:00.000Z' },
    ],
    routingInput,
  } as unknown as DayPlanResponse;

  it('returns null when the plan has no routingInput', () => {
    expect(toOptimizerInput({ ...plan, routingInput: null } as DayPlanResponse, new Date())).toBeNull();
  });

  it('builds an optimizer input with origin index, service seconds and matrix', () => {
    const input = toOptimizerInput(plan, new Date('2026-11-04T20:00:00.000Z'));
    expect(input).not.toBeNull();
    expect(input!.originIndex).toBe(0);
    expect(input!.travelS).toEqual(routingInput.travelS);
    expect(input!.stops.map((s) => s.key)).toEqual(['A', 'B']);
    expect(input!.stops[0]!.serviceS).toBe(45 * 60);
    expect(input!.stops[0]!.matrixIndex).toBe(1);
  });

  it('skips executed stops and those without coordinates', () => {
    const mixed = {
      ...plan,
      stops: [
        plan.stops[0],
        { ...plan.stops[1], executed: true },
      ],
    } as DayPlanResponse;
    expect(toOptimizerInput(mixed, new Date())).toBeNull(); // only 1 reorderable left
  });
});

describe('previewDayPlanOrderRequestSchema', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  it('accepts a valid candidate order', () => {
    expect(previewDayPlanOrderRequestSchema.safeParse({ appointmentIds: [id(1), id(2)], basedOnVersion: 3 }).success).toBe(true);
  });
  it('rejects duplicate ids', () => {
    expect(previewDayPlanOrderRequestSchema.safeParse({ appointmentIds: [id(1), id(1)], basedOnVersion: 1 }).success).toBe(false);
  });
  it('rejects more than the max stops', () => {
    const ids = Array.from({ length: DAY_PLAN_MAX_STOPS_PER_ORDER + 1 }, (_, i) => id(i + 1));
    expect(previewDayPlanOrderRequestSchema.safeParse({ appointmentIds: ids, basedOnVersion: 1 }).success).toBe(false);
  });
  it('rejects non-uuid ids and basedOnVersion < 1', () => {
    expect(previewDayPlanOrderRequestSchema.safeParse({ appointmentIds: ['x'], basedOnVersion: 1 }).success).toBe(false);
    expect(previewDayPlanOrderRequestSchema.safeParse({ appointmentIds: [id(1)], basedOnVersion: 0 }).success).toBe(false);
  });
});

describe('previewDayPlanOrderResponseSchema', () => {
  const base = {
    etaSource: 'MATRIX' as const,
    approximate: false,
    approximateReason: null,
    departureAt: '2026-11-05T21:00:00.000Z',
    finishEta: null,
    totals: { driveS: 600, waitS: 0, serviceS: 2700, lateS: 0, distanceM: null },
    feasible: true,
    violations: [],
    stops: [{ appointmentId: '00000000-0000-4000-8000-000000000001', sequence: 1, eta: '2026-11-05T22:00:00.000Z', travelS: 600, waitS: 0, lateS: 0 }],
  };
  it('parses the contract shape', () => {
    expect(previewDayPlanOrderResponseSchema.safeParse(base).success).toBe(true);
  });
  it('requires etaSource MATRIX', () => {
    expect(previewDayPlanOrderResponseSchema.safeParse({ ...base, etaSource: 'STORED' }).success).toBe(false);
  });
});
