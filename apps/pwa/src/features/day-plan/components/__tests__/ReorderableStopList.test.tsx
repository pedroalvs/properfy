import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { DayPlanResponse } from '@properfy/shared';
import { renderWithProviders } from '@/test-utils';
import { buildDayPlan, buildStop, STOP_IDS } from '../../__fixtures__/day-plan';
import { ReorderableStopList } from '../ReorderableStopList';
import { useReorderDraft } from '../../hooks/useReorderDraft';

vi.mock('@/features/execution/lib/indexeddb', () => ({ getExecutionState: () => Promise.resolve(undefined) }));
vi.mock('@/features/execution/lib/execution-state-events', () => ({ subscribeExecutionStateChange: () => () => {} }));

const { A, B, C } = STOP_IDS;
const X = 'x0000000-0000-4000-8000-000000000000';
const ORIGIN = '2026-11-04T20:00:00.000Z';
const WIDE_END = '2026-11-05T10:00:00.000Z';

function reorderablePlan(overrides: Partial<DayPlanResponse> = {}): DayPlanResponse {
  const base = (id: string, seq: number, lat: number, lng: number, extra = {}) =>
    buildStop({ appointmentId: id, sequence: seq, lat, lng, durationMinutes: 30, windowStartAt: ORIGIN, windowEndAt: WIDE_END, ...extra });
  return buildDayPlan({
    stops: [
      base(X, 1, -33.86, 151.18, { appointmentStatus: 'DONE', executionStatus: 'FINISHED', executed: true }),
      base(A, 2, -33.88, 151.2),
      base(B, 3, -33.89, 151.22),
      base(C, 4, -33.87, 151.19),
    ],
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

function Harness({ plan }: { plan: DayPlanResponse }) {
  const draft = useReorderDraft(plan, false);
  return <ReorderableStopList plan={plan} draft={draft} />;
}

beforeEach(() => vi.setSystemTime(new Date('2026-11-04T19:00:00.000Z')));

describe('ReorderableStopList', () => {
  it('shows drag handles and arrows only for the not-started stops', () => {
    renderWithProviders(<Harness plan={reorderablePlan()} />);
    // The locked (done) stop has no handle.
    expect(screen.queryByRole('button', { name: 'Drag to reorder stop 1' })).toBeNull();
    for (const n of [2, 3, 4]) {
      expect(screen.getByRole('button', { name: `Drag to reorder stop ${n}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Move stop ${n} up` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Move stop ${n} down` })).toBeInTheDocument();
    }
  });

  it('disables the arrows at the reorderable bounds', () => {
    renderWithProviders(<Harness plan={reorderablePlan()} />);
    expect(screen.getByRole('button', { name: 'Move stop 2 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move stop 4 down' })).toBeDisabled();
  });

  it('reorders with an arrow and announces the new position', () => {
    renderWithProviders(<Harness plan={reorderablePlan()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move stop 2 down' }));
    // A moved to the third display position (locked prefix of 1 + reorderable index 1).
    const status = screen.getByTestId('reorder-announcement');
    expect(status.textContent).toContain('Stop moved to position 3 of 4.');
    expect(status.textContent).toContain('vs. suggested');
  });

  it('shows local ETAs with a tilde during editing', () => {
    renderWithProviders(<Harness plan={reorderablePlan()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move stop 2 down' }));
    // At least one reorderable row shows a local "~" ETA.
    expect(screen.getAllByText(/~\d/).length).toBeGreaterThan(0);
  });

  it('warns on a window overrun without removing any control (DB3)', () => {
    const plan = reorderablePlan({
      stops: [
        buildStop({ appointmentId: A, sequence: 1, lat: -33.88, lng: 151.2, durationMinutes: 30, windowStartAt: ORIGIN, windowEndAt: WIDE_END }),
        buildStop({ appointmentId: B, sequence: 2, lat: -33.89, lng: 151.22, durationMinutes: 30, windowStartAt: ORIGIN, windowEndAt: WIDE_END }),
        buildStop({ appointmentId: C, sequence: 3, lat: -33.87, lng: 151.19, durationMinutes: 30, windowStart: '07:00', windowEnd: '07:30', windowStartAt: ORIGIN, windowEndAt: '2026-11-04T20:30:00.000Z' }),
      ],
      suggestedOrder: [A, B, C],
    });
    renderWithProviders(<Harness plan={plan} />);
    expect(screen.getByText('Stop 3 would arrive after its window 7:00 am – 7:30 am')).toBeInTheDocument();
    // Controls remain — a violation only warns.
    expect(screen.getByRole('button', { name: 'Drag to reorder stop 1' })).toBeInTheDocument();
  });

  it('renders the help text', () => {
    renderWithProviders(<Harness plan={reorderablePlan()} />);
    expect(screen.getByText('Drag or use the arrows to reorder. Times update as you go.')).toBeInTheDocument();
  });
});
