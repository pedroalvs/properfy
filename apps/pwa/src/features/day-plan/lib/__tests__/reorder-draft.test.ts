import { describe, it, expect } from 'vitest';
import {
  buildLegOverrides,
  evaluateSequence,
  toOptimizerInput,
  type DayPlanResponse,
  type DayPlanStop,
} from '@properfy/shared';
import { buildDayPlan, buildStop, STOP_IDS } from '../../__fixtures__/day-plan';
import {
  alignOrder,
  canReorder,
  evaluateDraft,
  formatDelta,
  formatDrivingTotal,
  formatLocalEta,
  getReorderableSets,
  moveDown,
  moveItem,
  moveUp,
  toViolationMessages,
} from '../reorder-draft';

const { A, B, C } = STOP_IDS;
const ORIGIN = '2026-11-04T20:00:00.000Z';
const WIDE_END = '2026-11-05T10:00:00.000Z';

/**
 * A plan with a full 4×4 matrix (origin, A, B, C) so the local evaluator has a
 * real matrix to reorder against. Asymmetric travel times make order matter.
 */
function matrixPlan(overrides: Partial<DayPlanResponse> = {}): DayPlanResponse {
  const stop = (id: string, sequence: number, lat: number, lng: number, extra: Partial<DayPlanStop> = {}) =>
    buildStop({
      appointmentId: id,
      sequence,
      lat,
      lng,
      durationMinutes: 30,
      windowStartAt: ORIGIN,
      windowEndAt: WIDE_END,
      ...extra,
    });
  return buildDayPlan({
    stops: [
      stop(A, 1, -33.88, 151.2),
      stop(B, 2, -33.89, 151.22),
      stop(C, 3, -33.87, 151.19),
    ],
    suggestedOrder: [A, B, C],
    routingInput: {
      points: [
        { key: 'origin', lat: -33.87, lng: 151.2 },
        { key: A, lat: -33.88, lng: 151.2 },
        { key: B, lat: -33.89, lng: 151.22 },
        { key: C, lat: -33.87, lng: 151.19 },
      ],
      // origin,A,B,C — asymmetric so [A,C,B] costs more than [A,B,C].
      travelS: [
        [0, 300, 900, 600],
        [300, 0, 600, 1200],
        [900, 600, 0, 400],
        [600, 1200, 400, 0],
      ],
      originKey: 'origin',
      earliestDepartureAt: ORIGIN,
      weights: { travel: 1, windowWait: 1, baseProximity: 1 },
      legTravelS: [
        { fromKey: 'origin', toKey: A, travelS: 300 },
        { fromKey: A, toKey: B, travelS: 600 },
        { fromKey: B, toKey: C, travelS: 400 },
      ],
    },
    ...overrides,
  });
}

const NOW = new Date('2026-11-04T19:00:00.000Z');

describe('getReorderableSets', () => {
  it('derives reorderable (NOT_STARTED) and locked sets live, in sequence order', () => {
    const plan = matrixPlan({
      stops: [
        buildStop({ appointmentId: 'x', sequence: 1, appointmentStatus: 'DONE', executionStatus: 'FINISHED', executed: true }),
        buildStop({ appointmentId: 'y', sequence: 2, executionStatus: 'IN_PROGRESS' }),
        buildStop({ appointmentId: A, sequence: 3 }),
        buildStop({ appointmentId: B, sequence: 4 }),
        buildStop({ appointmentId: C, sequence: 5 }),
      ],
    });
    expect(getReorderableSets(plan)).toEqual({ reorderableIds: [A, B, C], lockedIds: ['x', 'y'] });
  });

  it('drops a stop checked in on this device (local in-progress) immediately', () => {
    const plan = matrixPlan();
    const sets = getReorderableSets(plan, new Set([A]));
    expect(sets.reorderableIds).toEqual([B, C]);
    expect(sets.lockedIds).toEqual([A]);
  });
});

describe('order operations', () => {
  it('moveItem returns a new array without mutating', () => {
    const order = [A, B, C];
    expect(moveItem(order, 0, 2)).toEqual([B, C, A]);
    expect(order).toEqual([A, B, C]);
  });

  it('moveUp / moveDown respect the bounds', () => {
    expect(moveUp([A, B, C], B)).toEqual([B, A, C]);
    expect(moveUp([A, B, C], A)).toEqual([A, B, C]);
    expect(moveDown([A, B, C], C)).toEqual([A, B, C]);
    expect(moveDown([A, B, C], A)).toEqual([B, A, C]);
  });

  it('alignOrder sorts by the preferred order and appends the missing at the end', () => {
    // suggested [B,A,C,Z] with Z not reorderable → [B,A,C]; a reorderable absent
    // from the suggestion keeps its current order at the end.
    expect(alignOrder([B, A, C, 'z'], [A, B, C])).toEqual([B, A, C]);
    expect(alignOrder([B, A], [A, B, C])).toEqual([B, A, C]);
  });
});

describe('evaluateDraft', () => {
  it('returns null (cannot reorder) when there is no routingInput', () => {
    const plan = matrixPlan({ routingInput: null });
    expect(evaluateDraft(plan, [A, B, C], NOW)).toBeNull();
    expect(canReorder(plan, NOW)).toBe(false);
  });

  it('cannot reorder with only one not-started stop', () => {
    const plan = matrixPlan({
      stops: [
        buildStop({ appointmentId: A, sequence: 1, lat: -33.88, lng: 151.2, windowStartAt: ORIGIN, windowEndAt: WIDE_END }),
      ],
      suggestedOrder: [A],
    });
    expect(canReorder(plan, NOW)).toBe(false);
    expect(evaluateDraft(plan, [A], NOW)).toBeNull();
  });

  it('reproduces the server finish for the saved order (all legs from legTravelS)', () => {
    const plan = matrixPlan();
    const input = toOptimizerInput(plan, NOW)!;
    const expected = evaluateSequence(input, [A, B, C], { legTravelS: buildLegOverrides([A, B, C], plan.routingInput) });
    const draft = evaluateDraft(plan, [A, B, C], NOW)!;
    expect(draft.invalid).toBe(false);
    expect(draft.finishS).toBe(expected.finishS);
    expect(draft.deltaFinishMin).toBe(0); // same as suggested
  });

  it('a costlier order finishes later than suggested (positive delta)', () => {
    const plan = matrixPlan();
    const draft = evaluateDraft(plan, [A, C, B], NOW)!;
    // [A,C,B] uses matrix legs (A→C 1200, C→B 400) vs suggested [A,B,C] (legTravelS).
    expect(draft.deltaFinishMin).toBeGreaterThan(0);
    expect(draft.totalTravelS).toBeGreaterThan(0);
  });

  it('flags an order that does not match the optimizer keys as invalid', () => {
    const plan = matrixPlan();
    const draft = evaluateDraft(plan, [A, B], NOW)!;
    expect(draft.invalid).toBe(true);
  });

  it('passes `now` through so earliest departure maxes with the current time', () => {
    const plan = matrixPlan();
    const early = toOptimizerInput(plan, new Date('2026-11-04T18:00:00.000Z'))!;
    const late = toOptimizerInput(plan, new Date('2026-11-04T23:00:00.000Z'))!;
    // earliestDepartureAt = 20:00Z; now 18:00 → 20:00; now 23:00 → 23:00.
    expect(early.earliestDepartureS).toBe(Math.floor(Date.parse(ORIGIN) / 1000));
    expect(late.earliestDepartureS).toBe(Math.floor(Date.parse('2026-11-04T23:00:00.000Z') / 1000));
  });

  it('reports a window violation for an order that arrives after a tight window', () => {
    const plan = matrixPlan({
      stops: [
        buildStop({ appointmentId: A, sequence: 1, lat: -33.88, lng: 151.2, durationMinutes: 30, windowStartAt: ORIGIN, windowEndAt: WIDE_END }),
        buildStop({ appointmentId: B, sequence: 2, lat: -33.89, lng: 151.22, durationMinutes: 30, windowStartAt: ORIGIN, windowEndAt: WIDE_END }),
        // C only open 20:00–20:30Z: reaching it last (after A+B service+travel) is late.
        buildStop({ appointmentId: C, sequence: 3, lat: -33.87, lng: 151.19, durationMinutes: 30, windowStart: '07:00', windowEnd: '07:30', windowStartAt: ORIGIN, windowEndAt: '2026-11-04T20:30:00.000Z' }),
      ],
    });
    const draft = evaluateDraft(plan, [A, B, C], NOW)!;
    expect(draft.violations.some((v) => v.key === C)).toBe(true);
    const messages = toViolationMessages(plan, [A, B, C], draft.violations);
    expect(messages).toContainEqual({ key: C, message: 'Stop 3 would arrive after its window 7:00 am – 7:30 am' });
  });
});

describe('formatting', () => {
  it('formats the finish delta', () => {
    expect(formatDelta(12)).toBe('+12 min vs. suggested');
    expect(formatDelta(-5)).toBe('−5 min vs. suggested');
    expect(formatDelta(0)).toBe('Same finish time as suggested');
  });

  it('formats the driving total', () => {
    expect(formatDrivingTotal(3300)).toBe('55 min driving');
  });

  it('formats a local ETA with a tilde in the stop timezone', () => {
    const serviceStartS = Math.floor(Date.parse('2026-11-04T22:12:00.000Z') / 1000); // 9:12 am Sydney
    expect(formatLocalEta(serviceStartS, 'Australia/Sydney')).toBe('~9:12 am');
    expect(formatLocalEta(undefined, 'Australia/Sydney')).toBe('');
  });

  it('numbers violation messages by position counting the locked prefix', () => {
    const plan = matrixPlan();
    // display order has a locked stop at the front, so B is "Stop 3".
    const messages = toViolationMessages(plan, ['locked', A, B], [{ key: B, lateS: 600 }]);
    expect(messages[0]!.message).toContain('Stop 3 would arrive after its window');
  });
});
