import { describe, it, expect } from 'vitest';
import {
  buildLegOverrides,
  toOptimizerInput,
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
