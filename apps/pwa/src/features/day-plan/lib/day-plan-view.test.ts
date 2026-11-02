import { describe, it, expect } from 'vitest';
import { buildDayPlan, buildStop, STOP_IDS } from '../__fixtures__/day-plan';
import { progress, nextStop, comingUp, allDone, isEmpty, stopsInOrder } from './day-plan-view';

const { A, B, C } = STOP_IDS;

describe('day-plan-view selectors', () => {
  it('progress counts DONE stops against the total', () => {
    const plan = buildDayPlan({
      stops: [
        buildStop({ appointmentId: A, sequence: 1, appointmentStatus: 'DONE', executed: true }),
        buildStop({ appointmentId: B, sequence: 2 }),
        buildStop({ appointmentId: C, sequence: 3 }),
      ],
    });
    expect(progress(plan)).toEqual({ done: 1, total: 3 });
  });

  it('nextStop is the first not-executed stop after the done ones', () => {
    const plan = buildDayPlan({
      stops: [
        buildStop({ appointmentId: A, sequence: 1, appointmentStatus: 'DONE', executed: true }),
        buildStop({ appointmentId: B, sequence: 2, executionStatus: 'NOT_STARTED' }),
        buildStop({ appointmentId: C, sequence: 3 }),
      ],
    });
    expect(nextStop(plan)?.appointmentId).toBe(B);
  });

  it('nextStop prefers an in-progress stop even if it is marked executed', () => {
    const plan = buildDayPlan({
      stops: [
        buildStop({ appointmentId: A, sequence: 1, executionStatus: 'IN_PROGRESS', executed: true }),
        buildStop({ appointmentId: B, sequence: 2 }),
      ],
    });
    const next = nextStop(plan);
    expect(next?.appointmentId).toBe(A);
    expect(next?.executionStatus).toBe('IN_PROGRESS');
  });

  it('allDone + null next when every stop is DONE', () => {
    const plan = buildDayPlan({
      stops: [
        buildStop({ appointmentId: A, sequence: 1, appointmentStatus: 'DONE', executed: true }),
        buildStop({ appointmentId: B, sequence: 2, appointmentStatus: 'DONE', executed: true }),
      ],
    });
    expect(nextStop(plan)).toBeNull();
    expect(allDone(plan)).toBe(true);
  });

  it('comingUp returns up to three not-executed stops after the next', () => {
    const stops = [1, 2, 3, 4, 5, 6].map((seq) =>
      buildStop({
        appointmentId: `${seq}0000000-0000-4000-8000-000000000000`,
        sequence: seq,
        appointmentStatus: seq === 1 ? 'DONE' : 'SCHEDULED',
        executed: seq === 1,
      }),
    );
    const plan = buildDayPlan({ stops });
    expect(nextStop(plan)?.sequence).toBe(2);
    expect(comingUp(plan).map((s) => s.sequence)).toEqual([3, 4, 5]);
  });

  it('empty plan: no next, not all done, empty true', () => {
    const plan = buildDayPlan({ stops: [] });
    expect(nextStop(plan)).toBeNull();
    expect(allDone(plan)).toBe(false);
    expect(isEmpty(plan)).toBe(true);
  });

  it('stopsInOrder sorts an out-of-order payload by sequence', () => {
    const plan = buildDayPlan({
      stops: [
        buildStop({ appointmentId: C, sequence: 3 }),
        buildStop({ appointmentId: A, sequence: 1 }),
        buildStop({ appointmentId: B, sequence: 2 }),
      ],
    });
    expect(stopsInOrder(plan).map((s) => s.sequence)).toEqual([1, 2, 3]);
  });
});
