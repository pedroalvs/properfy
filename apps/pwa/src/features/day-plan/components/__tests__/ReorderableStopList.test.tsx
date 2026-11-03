import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { DayPlanResponse } from '@properfy/shared';
import { renderWithProviders } from '@/test-utils';
import { buildDayPlan, buildStop, STOP_IDS } from '../../__fixtures__/day-plan';
import { ReorderableStopList } from '../ReorderableStopList';
import { useReorderDraft } from '../../hooks/useReorderDraft';
import type { ReorderPreviewView } from '../../lib/reorder-preview';

vi.mock('@/features/execution/lib/indexeddb', () => ({ getExecutionState: () => Promise.resolve(undefined) }));
vi.mock('@/features/execution/lib/execution-state-events', () => ({ subscribeExecutionStateChange: () => () => {} }));

const { A, B, C } = STOP_IDS;
const X = 'x0000000-0000-4000-8000-000000000000';

/** A READY preview with per-stop ETAs for A/B/C; override delta/violations per test. */
function previewView(overrides: Partial<ReorderPreviewView> = {}): ReorderPreviewView {
  return {
    status: 'READY',
    reason: null,
    finishMs: Date.parse('2026-11-04T23:35:00.000Z'),
    deltaMin: 0,
    driveS: 1800,
    etaByAppointmentId: {
      [A]: Date.parse('2026-11-04T21:00:00.000Z'),
      [B]: Date.parse('2026-11-04T22:00:00.000Z'),
      [C]: Date.parse('2026-11-04T23:00:00.000Z'),
    },
    violations: [],
    ...overrides,
  };
}

function reorderablePlan(overrides: Partial<DayPlanResponse> = {}): DayPlanResponse {
  const base = (id: string, seq: number, extra = {}) => buildStop({ appointmentId: id, sequence: seq, ...extra });
  return buildDayPlan({
    stops: [
      base(X, 1, { appointmentStatus: 'DONE', executionStatus: 'FINISHED', executed: true }),
      base(A, 2),
      base(B, 3),
      base(C, 4),
    ],
    suggestedOrder: [A, B, C],
    ...overrides,
  });
}

function Harness({ plan, preview }: { plan: DayPlanResponse; preview: ReorderPreviewView }) {
  const draft = useReorderDraft(plan, false);
  return <ReorderableStopList plan={plan} draft={draft} preview={preview} />;
}

beforeEach(() => vi.setSystemTime(new Date('2026-11-04T19:00:00.000Z')));

describe('ReorderableStopList', () => {
  it('shows drag handles and arrows only for the not-started stops', () => {
    renderWithProviders(<Harness plan={reorderablePlan()} preview={previewView()} />);
    expect(screen.queryByRole('button', { name: 'Drag to reorder stop 1' })).toBeNull();
    for (const n of [2, 3, 4]) {
      expect(screen.getByRole('button', { name: `Drag to reorder stop ${n}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Move stop ${n} up` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Move stop ${n} down` })).toBeInTheDocument();
    }
  });

  it('disables the arrows at the reorderable bounds', () => {
    renderWithProviders(<Harness plan={reorderablePlan()} preview={previewView()} />);
    expect(screen.getByRole('button', { name: 'Move stop 2 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move stop 4 down' })).toBeDisabled();
  });

  it('announces the new position immediately, then the finish/delta once the preview resolves', () => {
    const { rerender } = renderWithProviders(
      <Harness plan={reorderablePlan()} preview={previewView({ deltaMin: 0 })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move stop 2 down' }));
    const status = screen.getByTestId('reorder-announcement');
    // Step 1: position only (the server preview for the new order is not back yet).
    expect(status.textContent).toContain('Stop moved to position 3 of 4.');
    expect(status.textContent).not.toContain('vs. suggested');
    // Step 2: the preview for the new order resolves (delta changes) → finish/delta announced.
    rerender(
      <Harness plan={reorderablePlan()} preview={previewView({ deltaMin: 12, finishMs: Date.parse('2026-11-04T23:47:00.000Z') })} />,
    );
    expect(status.textContent).toContain('vs. suggested');
  });

  it('shows per-stop ETAs from the preview with a tilde', () => {
    renderWithProviders(<Harness plan={reorderablePlan()} preview={previewView()} />);
    expect(screen.getAllByText(/~\d/).length).toBeGreaterThan(0);
  });

  it('warns on a window overrun (from the preview) without removing any control (DB3)', () => {
    const plan = reorderablePlan({
      stops: [
        buildStop({ appointmentId: A, sequence: 1 }),
        buildStop({ appointmentId: B, sequence: 2 }),
        buildStop({ appointmentId: C, sequence: 3, windowStart: '07:00', windowEnd: '07:30' }),
      ],
      suggestedOrder: [A, B, C],
    });
    renderWithProviders(
      <Harness plan={plan} preview={previewView({ violations: [{ appointmentId: C, lateS: 900 }] })} />,
    );
    expect(screen.getByText('Stop 3 would arrive after its window 7:00 am – 7:30 am')).toBeInTheDocument();
    // Controls remain — a violation only warns.
    expect(screen.getByRole('button', { name: 'Drag to reorder stop 1' })).toBeInTheDocument();
  });

  it('renders the help text', () => {
    renderWithProviders(<Harness plan={reorderablePlan()} preview={previewView()} />);
    expect(screen.getByText('Drag or use the arrows to reorder. Times update as you go.')).toBeInTheDocument();
  });
});
