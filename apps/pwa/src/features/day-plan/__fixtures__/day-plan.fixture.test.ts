import { describe, it, expect } from 'vitest';
import { dayPlanResponseSchema, dayPlanStopSchema } from '@properfy/shared';
import { buildDayPlan, buildStop, buildStops } from './day-plan';

describe('day-plan fixtures match the API shape', () => {
  it('buildDayPlan() parses against dayPlanResponseSchema', () => {
    expect(() => dayPlanResponseSchema.parse(buildDayPlan())).not.toThrow();
  });

  it('buildStop() parses against dayPlanStopSchema', () => {
    expect(() => dayPlanStopSchema.parse(buildStop())).not.toThrow();
  });

  it('buildStops() yields three sequenced, parseable stops', () => {
    const stops = buildStops();
    expect(stops).toHaveLength(3);
    expect(stops.map((s) => s.sequence)).toEqual([1, 2, 3]);
    for (const stop of stops) expect(() => dayPlanStopSchema.parse(stop)).not.toThrow();
  });

  it('overrides are applied and still parse', () => {
    const plan = buildDayPlan({ status: 'STALE', stops: [] });
    expect(plan.status).toBe('STALE');
    expect(plan.stops).toEqual([]);
    expect(() => dayPlanResponseSchema.parse(plan)).not.toThrow();
  });
});
