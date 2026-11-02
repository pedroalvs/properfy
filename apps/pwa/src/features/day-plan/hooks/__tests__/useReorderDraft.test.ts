import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { DayPlanResponse, DayPlanStop } from '@properfy/shared';
import { buildDayPlan, buildStop, STOP_IDS } from '../../__fixtures__/day-plan';
import { useReorderDraft } from '../useReorderDraft';

vi.mock('@/features/execution/lib/indexeddb', () => ({ getExecutionState: () => Promise.resolve(undefined) }));
vi.mock('@/features/execution/lib/execution-state-events', () => ({ subscribeExecutionStateChange: () => () => {} }));

const { A, B, C } = STOP_IDS;
const ORIGIN = '2026-11-04T20:00:00.000Z';
const WIDE_END = '2026-11-05T10:00:00.000Z';

function plan(overrides: Partial<DayPlanResponse> = {}, stops?: DayPlanStop[]): DayPlanResponse {
  const base = (id: string, seq: number, lat: number, lng: number) =>
    buildStop({ appointmentId: id, sequence: seq, lat, lng, durationMinutes: 30, windowStartAt: ORIGIN, windowEndAt: WIDE_END });
  const theStops = stops ?? [base(A, 1, -33.88, 151.2), base(B, 2, -33.89, 151.22), base(C, 3, -33.87, 151.19)];
  return buildDayPlan({
    stops: theStops,
    suggestedOrder: [A, B, C],
    routingInput: {
      points: [
        { key: 'origin', lat: -33.87, lng: 151.2 },
        { key: A, lat: -33.88, lng: 151.2 },
        { key: B, lat: -33.89, lng: 151.22 },
        { key: C, lat: -33.87, lng: 151.19 },
      ],
      travelS: [
        [0, 300, 900, 600],
        [300, 0, 600, 1200],
        [900, 600, 0, 400],
        [600, 1200, 400, 0],
      ],
      originKey: 'origin',
      earliestDepartureAt: null,
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

beforeEach(() => vi.setSystemTime(new Date('2026-11-04T19:00:00.000Z')));

function setup(initial: DayPlanResponse, stale = false) {
  return renderHook(({ p, s }: { p: DayPlanResponse; s: boolean }) => useReorderDraft(p, s), {
    initialProps: { p: initial, s: stale },
  });
}

describe('useReorderDraft', () => {
  it('starts not dirty, following the plan order', async () => {
    const { result } = setup(plan());
    await waitFor(() => expect(result.current.canReorder).toBe(true));
    expect(result.current.order).toEqual([A, B, C]);
    expect(result.current.isDirty).toBe(false);
  });

  it('a move makes it dirty and updates the order', async () => {
    const { result } = setup(plan());
    await waitFor(() => expect(result.current.canReorder).toBe(true));
    act(() => result.current.moveDown(A));
    expect(result.current.order).toEqual([B, A, C]);
    expect(result.current.isDirty).toBe(true);
  });

  it('adopts a new version silently when there is no draft', async () => {
    const { result, rerender } = setup(plan());
    await waitFor(() => expect(result.current.canReorder).toBe(true));
    rerender({ p: plan({ version: 4 }), s: false });
    expect(result.current.frozen).toBe(false);
    expect(result.current.notice).toBeNull();
    expect(result.current.order).toEqual([A, B, C]);
  });

  it('freezes a dirty draft when a newer version arrives; review adopts it', async () => {
    const { result, rerender } = setup(plan());
    await waitFor(() => expect(result.current.canReorder).toBe(true));
    act(() => result.current.moveDown(A));
    rerender({ p: plan({ version: 4 }), s: false });
    expect(result.current.frozen).toBe(true);
    expect(result.current.notice).toBe('VERSION_FROZEN');
    act(() => result.current.review());
    expect(result.current.frozen).toBe(false);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.order).toEqual([A, B, C]);
  });

  it('discards the draft when the reorderable set changes', async () => {
    const { result, rerender } = setup(plan());
    await waitFor(() => expect(result.current.canReorder).toBe(true));
    act(() => result.current.moveDown(A));
    expect(result.current.isDirty).toBe(true);
    // B removed (e.g. CANT_DO): A and C remain.
    const base = (id: string, seq: number, lat: number, lng: number) =>
      buildStop({ appointmentId: id, sequence: seq, lat, lng, durationMinutes: 30, windowStartAt: ORIGIN, windowEndAt: WIDE_END });
    rerender({ p: plan({ version: 4 }, [base(A, 1, -33.88, 151.2), base(C, 3, -33.87, 151.19)]), s: false });
    expect(result.current.notice).toBe('SET_DISCARDED');
    expect(result.current.isDirty).toBe(false);
  });

  it('reports STALE so Save can be blocked', async () => {
    const { result } = setup(plan(), true);
    await waitFor(() => expect(result.current.canReorder).toBe(true));
    expect(result.current.stale).toBe(true);
    expect(result.current.notice).toBe('STALE');
  });

  it('re-bases basedOnVersion after a move-and-undo, so the next Save is not a stale-version 409', async () => {
    const { result, rerender } = setup(plan({ version: 3 }));
    await waitFor(() => expect(result.current.canReorder).toBe(true));
    // Move A down then back up → clean again (not a real draft).
    act(() => result.current.moveDown(A));
    act(() => result.current.moveUp(A));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.baseVersion).toBe(3);
    // A refetch bumps the version (same order, e.g. an ETA recompute).
    rerender({ p: plan({ version: 4 }), s: false });
    expect(result.current.frozen).toBe(false);
    expect(result.current.baseVersion).toBe(4);
    // A real move now bases on the fresh version.
    act(() => result.current.moveDown(A));
    expect(result.current.isDirty).toBe(true);
    expect(result.current.baseVersion).toBe(4);
  });

  it('unfreezes when a refetch makes the saved order match the frozen draft', async () => {
    const { result, rerender } = setup(plan({ version: 3 }));
    await waitFor(() => expect(result.current.canReorder).toBe(true));
    act(() => result.current.moveDown(A)); // draft [B, A, C]
    rerender({ p: plan({ version: 4 }), s: false });
    expect(result.current.frozen).toBe(true);
    // A later refetch persists that very order as the saved order (B, A, C).
    const reordered = [
      buildStop({ appointmentId: B, sequence: 1, lat: -33.89, lng: 151.22, durationMinutes: 30, windowStartAt: ORIGIN, windowEndAt: WIDE_END }),
      buildStop({ appointmentId: A, sequence: 2, lat: -33.88, lng: 151.2, durationMinutes: 30, windowStartAt: ORIGIN, windowEndAt: WIDE_END }),
      buildStop({ appointmentId: C, sequence: 3, lat: -33.87, lng: 151.19, durationMinutes: 30, windowStartAt: ORIGIN, windowEndAt: WIDE_END }),
    ];
    rerender({ p: plan({ version: 5 }, reordered), s: false });
    expect(result.current.frozen).toBe(false);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.order).toEqual([B, A, C]);
  });

  it('ignores moves while frozen', async () => {
    const { result, rerender } = setup(plan({ version: 3 }));
    await waitFor(() => expect(result.current.canReorder).toBe(true));
    act(() => result.current.moveDown(A));
    rerender({ p: plan({ version: 4 }), s: false });
    expect(result.current.frozen).toBe(true);
    const frozenOrder = result.current.order;
    act(() => result.current.moveDown(frozenOrder[0]!));
    expect(result.current.order).toEqual(frozenOrder);
  });

  it('resetToSuggested realigns the order locally with no API call', async () => {
    const { result } = setup(plan({ suggestedOrder: [C, A, B], manualOrder: true }));
    await waitFor(() => expect(result.current.canReorder).toBe(true));
    act(() => result.current.resetToSuggested());
    expect(result.current.order).toEqual([C, A, B]);
  });
});
