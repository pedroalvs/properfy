import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { buildDayPlan, STOP_IDS } from '../../__fixtures__/day-plan';
import { RouteSummary } from '../RouteSummary';
import type { ReorderDraft } from '../../hooks/useReorderDraft';
import type { ReorderPreviewView } from '../../lib/reorder-preview';

const { A, B, C } = STOP_IDS;

function draft(overrides: Partial<ReorderDraft> = {}): ReorderDraft {
  return {
    order: [A, B, C],
    reorderableIds: [A, B, C],
    lockedIds: [],
    displayOrder: [A, B, C],
    canReorder: true,
    isDirty: true,
    frozen: false,
    stale: false,
    baseVersion: 3,
    notice: null,
    moveTo: () => {},
    moveUp: () => {},
    moveDown: () => {},
    resetToSuggested: () => {},
    discard: () => {},
    review: () => {},
    clear: () => {},
    ...overrides,
  } as ReorderDraft;
}

function preview(overrides: Partial<ReorderPreviewView> = {}): ReorderPreviewView {
  return {
    status: 'READY',
    reason: null,
    approximate: false,
    finishMs: Date.parse('2026-11-04T23:47:00.000Z'),
    deltaMin: 12,
    driveS: 3300,
    etaByAppointmentId: {},
    violations: [],
    ...overrides,
  };
}

describe('RouteSummary (F04 Plan B preview)', () => {
  it('shows the server finish, delta and driving for a dirty draft', () => {
    renderWithProviders(<RouteSummary plan={buildDayPlan()} draft={draft()} preview={preview()} />);
    expect(screen.getByText(/Finish ~/)).toBeInTheDocument();
    expect(screen.getByText(/\+12 min vs\. suggested/)).toBeInTheDocument();
    expect(screen.getByText(/55 min driving/)).toBeInTheDocument();
  });

  it('shows the window violations from the preview (never blocking)', () => {
    renderWithProviders(
      <RouteSummary
        plan={buildDayPlan()}
        draft={draft()}
        preview={preview({ violations: [{ appointmentId: B, lateS: 900 }] })}
      />,
    );
    expect(screen.getByText(/would arrive after its window/)).toBeInTheDocument();
  });

  it('flags a degraded (approximate) preview as estimates while still showing the numbers', () => {
    renderWithProviders(
      <RouteSummary plan={buildDayPlan()} draft={draft()} preview={preview({ approximate: true })} />,
    );
    expect(screen.getByText(/Finish ~/)).toBeInTheDocument();
    expect(screen.getByText('Approximate route: travel times are estimates')).toBeInTheDocument();
  });

  it('shows an updating state while the preview is loading', () => {
    renderWithProviders(
      <RouteSummary plan={buildDayPlan()} draft={draft()} preview={preview({ status: 'LOADING' })} />,
    );
    expect(screen.getByText('Updating route times…')).toBeInTheDocument();
  });

  it('degrades gracefully when the preview is unavailable offline', () => {
    renderWithProviders(
      <RouteSummary
        plan={buildDayPlan()}
        draft={draft()}
        preview={preview({ status: 'UNAVAILABLE', reason: 'OFFLINE' })}
      />,
    );
    expect(screen.getByText(/unavailable offline/i)).toBeInTheDocument();
    // No fabricated delta is shown.
    expect(screen.queryByText(/vs\. suggested/)).toBeNull();
  });

  it('degrades (no delta) when the server rejects a started day', () => {
    renderWithProviders(
      <RouteSummary
        plan={buildDayPlan()}
        draft={draft()}
        preview={preview({ status: 'UNAVAILABLE', reason: 'STARTED' })}
      />,
    );
    expect(screen.getByText(/once your day has started/i)).toBeInTheDocument();
    expect(screen.queryByText(/vs\. suggested/)).toBeNull();
  });

  it('shows plan totals (not a preview line) when the order is neither dirty nor manual', () => {
    renderWithProviders(
      <RouteSummary plan={buildDayPlan()} draft={draft({ isDirty: false })} preview={preview({ status: 'IDLE' })} />,
    );
    // Non-manual branch: server plan totals, no delta line.
    expect(screen.queryByText(/vs\. suggested/)).toBeNull();
    expect(screen.queryByText('Updating route times…')).toBeNull();
  });
});
