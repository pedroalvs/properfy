import { describe, it, expect } from 'vitest';
import { buildDayPlan, buildStop, STOP_IDS } from '../../__fixtures__/day-plan';
import { alignOrder, canReorder, getReorderableSets, moveDown, moveItem, moveUp } from '../reorder-draft';

const { A, B, C } = STOP_IDS;

describe('getReorderableSets', () => {
  it('derives reorderable (NOT_STARTED) and locked sets live, in sequence order', () => {
    const plan = buildDayPlan({
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
    const plan = buildDayPlan({
      stops: [buildStop({ appointmentId: A, sequence: 1 }), buildStop({ appointmentId: B, sequence: 2 }), buildStop({ appointmentId: C, sequence: 3 })],
    });
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

describe('canReorder', () => {
  it('is true only with at least two not-started stops (no routingInput dependency)', () => {
    expect(canReorder([A, B])).toBe(true);
    expect(canReorder([A, B, C])).toBe(true);
    expect(canReorder([A])).toBe(false);
    expect(canReorder([])).toBe(false);
  });
});
