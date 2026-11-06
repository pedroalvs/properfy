import { describe, it, expect, vi } from 'vitest';
import { evaluateForPlan } from '../../../src/modules/tenant-eta/application/services/evaluate-for-plan';
import { buildLoadedPlan, buildPlan, makeFreshStop, INSPECTOR_ID, PLAN_DATE, DAY_PLAN_ID, NOW_0700 } from './fixtures';

function deps(overrides: { findPlanByInspectorDate?: unknown; loadPlan?: unknown; getFreshStop?: unknown } = {}) {
  const planReader = {
    findPlanByInspectorDate: vi.fn(overrides.findPlanByInspectorDate ?? (async () => ({ dayPlanId: DAY_PLAN_ID, appointmentIds: ['appt-A', 'appt-B', 'appt-C'] }))),
    loadPlan: vi.fn(overrides.loadPlan ?? (async () => buildLoadedPlan())),
    listSweepCandidates: vi.fn(),
  };
  const getFreshStop = { execute: vi.fn(overrides.getFreshStop ?? (async () => makeFreshStop())) };
  return { planReader, getFreshStop } as never;
}

describe('evaluateForPlan (common seed-in-plan flow)', () => {
  it('returns NO_PLAN when the inspector has no plan that day', async () => {
    const r = await evaluateForPlan(deps({ findPlanByInspectorDate: async () => null }), INSPECTOR_ID, PLAN_DATE, NOW_0700);
    expect(r).toEqual({ skip: 'NO_PLAN' });
  });

  it('returns PLAN_STALE when the seed stop is STALE', async () => {
    const r = await evaluateForPlan(deps({ getFreshStop: async () => makeFreshStop({ status: 'STALE' }) }), INSPECTOR_ID, PLAN_DATE, NOW_0700);
    expect(r).toEqual({ skip: 'PLAN_STALE' });
  });

  it('advances past an appointment that left the plan to the next seed (revision #5)', async () => {
    let call = 0;
    const d = deps({ getFreshStop: async () => (call++ === 0 ? null : makeFreshStop()) });
    const r = await evaluateForPlan(d, INSPECTOR_ID, PLAN_DATE, NOW_0700);
    expect('skip' in r).toBe(false);
    if (!('skip' in r)) expect(r.projection.map((p) => p.appointmentId)).toEqual(['appt-A', 'appt-B', 'appt-C']);
  });

  it('returns NO_PLAN only when every seed returns null', async () => {
    const r = await evaluateForPlan(deps({ getFreshStop: async () => null }), INSPECTOR_ID, PLAN_DATE, NOW_0700);
    expect(r).toEqual({ skip: 'NO_PLAN' });
  });

  it('skips a seed whose fresh stop belongs to a different plan (does not load the wrong plan)', async () => {
    let call = 0;
    const d = deps({ getFreshStop: async () => (call++ === 0 ? makeFreshStop({ dayPlanId: 'other-plan' }) : makeFreshStop()) });
    const r = await evaluateForPlan(d, INSPECTOR_ID, PLAN_DATE, NOW_0700);
    expect('skip' in r).toBe(false); // the second, correct-plan seed is used
  });

  it('returns NO_PLAN when the loaded plan is for a different date', async () => {
    const r = await evaluateForPlan(deps({ loadPlan: async () => buildLoadedPlan({ plan: buildPlan(undefined, { planDate: '2026-11-06' }) }) }), INSPECTOR_ID, PLAN_DATE, NOW_0700);
    expect(r).toEqual({ skip: 'NO_PLAN' });
  });

  it('projects the plan and reports the snapshot plan version', async () => {
    const r = await evaluateForPlan(deps(), INSPECTOR_ID, PLAN_DATE, NOW_0700);
    expect('skip' in r).toBe(false);
    if (!('skip' in r)) {
      expect(r.planVersion).toBe(1);
      expect(r.approximate).toBe(false);
      // E1: A 08:00, B 09:00, C 10:25 (Sydney) → start instants.
      const starts = r.projection.map((p) => p.projectedStartAt?.toISOString());
      expect(starts).toEqual(['2026-11-04T21:00:00.000Z', '2026-11-04T22:00:00.000Z', '2026-11-04T23:25:00.000Z']);
    }
  });
});
