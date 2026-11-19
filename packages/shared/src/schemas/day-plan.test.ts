import { describe, it, expect } from 'vitest';
import {
  dayPlanResponseSchema,
  previewDayPlanOrderRequestSchema,
  previewDayPlanOrderResponseSchema,
  DAY_PLAN_MAX_STOPS_PER_ORDER,
} from './day-plan';

describe('dayPlanResponseSchema', () => {
  it('no longer carries routingInput (F04 Plan B contract phase)', () => {
    expect(Object.keys(dayPlanResponseSchema.shape)).not.toContain('routingInput');
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
