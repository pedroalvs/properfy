import { describe, expect, it } from 'vitest';
import { DEFAULT_RELIABILITY_INDEX, RELIABILITY_METRIC_KEYS, type ReliabilityMetricResult } from '@properfy/shared';
import { buildComputation, buildGoal } from './__fixtures__/builders';
import { evaluateGoal, type GoalEvaluationContext } from './evaluate-goal';

const ctx: GoalEvaluationContext = { reliabilityIndex: DEFAULT_RELIABILITY_INDEX, periodEnd: '2026-11-30' };

/** A computation whose eight metrics all share one rate → score = 100 × rate. */
function indexComp(rateAll: number, volume = 12) {
  const rates = Object.fromEntries(RELIABILITY_METRIC_KEYS.map((k) => [k, rateAll])) as Partial<
    Record<ReliabilityMetricResult['metric'], number | null>
  >;
  return buildComputation({ volume, rates });
}

const twelveDates = Array.from({ length: 12 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);

describe('evaluateGoal · volume', () => {
  it('achieved with the Nth service date', () => {
    const result = evaluateGoal(buildGoal({ target: 10 }), buildComputation({ completedServiceDates: twelveDates }), ctx);
    expect(result).toMatchObject({ achieved: true, value: 12, achievedOn: '2026-11-10' });
  });
  it('not achieved below target', () => {
    const result = evaluateGoal(
      buildGoal({ target: 10 }),
      buildComputation({ completedServiceDates: twelveDates.slice(0, 8) }),
      ctx,
    );
    expect(result).toMatchObject({ achieved: false, value: 8, achievedOn: null });
  });
  it('no computation → value 0, serviceCount 0', () => {
    expect(evaluateGoal(buildGoal({ target: 10 }), undefined, ctx)).toMatchObject({
      achieved: false,
      value: 0,
      serviceCount: 0,
    });
  });
  it('region volume achieved (scoped computation)', () => {
    const result = evaluateGoal(
      buildGoal({ metric: 'REGION_VOLUME', target: 9, scopeRegionId: 'r1' }),
      buildComputation({ completedServiceDates: twelveDates.slice(0, 10) }),
      ctx,
    );
    expect(result).toMatchObject({ achieved: true, value: 10, achievedOn: '2026-11-09' });
  });
  it('DR3: volume ignores the reference/pro-rata (count only)', () => {
    const result = evaluateGoal(
      buildGoal({ target: 4 }),
      buildComputation({ volume: 4, completedServiceDates: twelveDates.slice(0, 4) }),
      ctx,
    );
    expect(result).toMatchObject({ achieved: true, value: 4 });
  });
});

describe('evaluateGoal · rate', () => {
  it('below target', () => {
    const r = evaluateGoal(buildGoal({ metric: 'PUNCTUALITY', target: 90 }), buildComputation({ volume: 12, rates: { PUNCTUALITY: 0.8333 } }), ctx);
    expect(r).toMatchObject({ achieved: false, value: 83.33 });
  });
  it('at/above target with achievedOn = period end', () => {
    const r = evaluateGoal(buildGoal({ metric: 'GEOFENCE', target: 90 }), buildComputation({ volume: 12, rates: { GEOFENCE: 0.9167 } }), ctx);
    expect(r).toMatchObject({ achieved: true, value: 91.67, achievedOn: '2026-11-30' });
  });
  it('not enough services keeps the value but blocks achievement', () => {
    const r = evaluateGoal(buildGoal({ metric: 'PUNCTUALITY', target: 90 }), buildComputation({ volume: 9, rates: { PUNCTUALITY: 1 } }), ctx);
    expect(r).toMatchObject({ achieved: false, value: 100, reason: 'NOT_ENOUGH_SERVICES' });
  });
  it('CANT_DO_MAX uses the complement and "at most" (boundary 20 ≤ 20)', () => {
    const goal = buildGoal({ metric: 'CANT_DO_MAX', comparator: 'LTE', target: 20 });
    expect(evaluateGoal(goal, buildComputation({ volume: 12, rates: { CANT_ATTEND: 0.8 } }), ctx)).toMatchObject({
      achieved: true,
      value: 20,
    });
    const strict = buildGoal({ metric: 'CANT_DO_MAX', comparator: 'LTE', target: 10 });
    expect(evaluateGoal(strict, buildComputation({ volume: 12, rates: { CANT_ATTEND: 0.8 } }), ctx)).toMatchObject({
      achieved: false,
      value: 20,
    });
  });
  it('P8 rounding: 0.89995 → 90.00 meets a target of 90', () => {
    const r = evaluateGoal(buildGoal({ metric: 'PUNCTUALITY', target: 90 }), buildComputation({ volume: 12, rates: { PUNCTUALITY: 0.89995 } }), ctx);
    expect(r).toMatchObject({ achieved: true, value: 90 });
  });
  it('null rate (not LATE_NOTICE) → NO_DATA', () => {
    const r = evaluateGoal(buildGoal({ metric: 'SATISFACTION', target: 50 }), buildComputation({ volume: 12, rates: { SATISFACTION: null } }), ctx);
    expect(r).toMatchObject({ achieved: false, value: null, reason: 'NO_DATA' });
  });
  it('LATE_NOTICE with no late services (null rate) counts as a perfect 100 (DV6)', () => {
    const r = evaluateGoal(buildGoal({ metric: 'LATE_NOTICE', target: 80 }), buildComputation({ volume: 10, rates: { LATE_NOTICE: null } }), ctx);
    expect(r).toMatchObject({ achieved: true, value: 100, achievedOn: '2026-11-30' });
  });
  it('LATE_NOTICE DV6 still blocked below the service minimum', () => {
    const r = evaluateGoal(buildGoal({ metric: 'LATE_NOTICE', target: 80 }), buildComputation({ volume: 9, rates: { LATE_NOTICE: null } }), ctx);
    expect(r).toMatchObject({ achieved: false, reason: 'NOT_ENOUGH_SERVICES' });
  });
  it('LATE_NOTICE with late services evaluates the rate', () => {
    const r = evaluateGoal(buildGoal({ metric: 'LATE_NOTICE', target: 80 }), buildComputation({ volume: 12, rates: { LATE_NOTICE: 0.5 } }), ctx);
    expect(r).toMatchObject({ achieved: false, value: 50 });
  });
});

describe('evaluateGoal · index', () => {
  it('below target', () => {
    const r = evaluateGoal(buildGoal({ metric: 'INDEX_AT_LEAST', target: 90 }), indexComp(0.883), ctx);
    expect(r).toMatchObject({ achieved: false, value: 88.3 });
  });
  it('at/above target', () => {
    expect(evaluateGoal(buildGoal({ metric: 'INDEX_AT_LEAST', target: 95 }), indexComp(1), ctx)).toMatchObject({
      achieved: true,
      value: 100,
    });
    expect(evaluateGoal(buildGoal({ metric: 'INDEX_AT_LEAST', target: 95 }), indexComp(0.975), ctx)).toMatchObject({
      achieved: true,
      value: 97.5,
    });
  });
  it('insufficient volume → NOT_ENOUGH_SERVICES', () => {
    const r = evaluateGoal(buildGoal({ metric: 'INDEX_AT_LEAST', target: 90 }), indexComp(0.9, 9), ctx);
    expect(r).toMatchObject({ achieved: false, value: null, reason: 'NOT_ENOUGH_SERVICES' });
  });
  it('DR3: changing the override in ctx does not change the index value', () => {
    const comp = indexComp(0.883);
    const base = evaluateGoal(buildGoal({ metric: 'INDEX_AT_LEAST', target: 90 }), comp, ctx);
    const withOverride = evaluateGoal(buildGoal({ metric: 'INDEX_AT_LEAST', target: 90 }), comp, {
      ...ctx,
      reliabilityIndex: { ...DEFAULT_RELIABILITY_INDEX, volumeReferenceOverride: 20 },
    });
    expect(withOverride.value).toBe(base.value);
  });
});
