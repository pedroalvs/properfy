import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { inspectorRouteColor } from '@properfy/shared';
import { LiveDayInspectorRow } from './LiveDayInspectorRow';
import { makeInspector, makeAlert } from '../test-support/fixtures';

function renderRow(inspector = makeInspector(), opts?: { isFutureDay?: boolean; selected?: boolean; onSelect?: () => void }) {
  return render(
    <ul>
      <LiveDayInspectorRow
        inspector={inspector}
        selected={opts?.selected ?? false}
        isFutureDay={opts?.isFutureDay ?? false}
        onSelect={opts?.onSelect ?? (() => {})}
      />
    </ul>,
  );
}

describe('LiveDayInspectorRow', () => {
  it('shows name, state, the inspector colour dot, progress and delay', () => {
    renderRow(makeInspector({ inspectorName: 'Jane Doe', state: 'AT_PROPERTY', delayMinutes: 22 }));
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('At a property')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-dot')).toHaveAttribute('data-color', inspectorRouteColor('insp-1').hex);
    const bar = screen.getByRole('progressbar', { name: 'Jane Doe progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    expect(screen.getByText('1 of 3 done')).toBeInTheDocument();
    expect(screen.getByText('+22 min')).toBeInTheDocument();
  });

  it('summarises alerts for screen readers', () => {
    renderRow(makeInspector({ alerts: [makeAlert({ type: 'CANT_DO' }), makeAlert({ type: 'LATE_NOTICE' })] }));
    expect(screen.getByText("2 alerts: Can't do this job, Running late")).toBeInTheDocument();
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    renderRow(makeInspector(), { onSelect });
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('shows the Approximate route chip and "No route plan" for a plan-less past/today', () => {
    renderRow(makeInspector({ routeApproximate: true, planStatus: 'NONE' }), { isFutureDay: false });
    expect(screen.getByText('Approximate route')).toBeInTheDocument();
    expect(screen.getByText('No route plan')).toBeInTheDocument();
  });

  it('shows the future "not generated yet" chip for a plan-less future day', () => {
    renderRow(makeInspector({ planStatus: 'NONE', routeApproximate: false }), { isFutureDay: true });
    expect(screen.getByText('Route not generated yet — plans publish at 19:30')).toBeInTheDocument();
  });

  it('shows "Not published yet" for a DRAFT plan', () => {
    renderRow(makeInspector({ planStatus: 'DRAFT', routeApproximate: false }));
    expect(screen.getByText('Not published yet')).toBeInTheDocument();
  });

  it('shows "Location unknown" when the last known source is NONE', () => {
    renderRow(
      makeInspector({ lastKnown: { source: 'NONE', lat: null, lng: null, at: null, appointmentId: null, label: null } }),
    );
    expect(screen.getByText('Location unknown')).toBeInTheDocument();
  });

  it('shows the "Route infeasible" indicator with its violations on hover', () => {
    renderRow(
      makeInspector({
        routeFeasible: false,
        routeViolations: [{ appointmentId: 'x', appointmentCode: 'RWS-0042', sequence: 3, lateMinutes: 25 }],
      }),
    );
    const trigger = screen.getByText('Route infeasible');
    fireEvent.mouseEnter(trigger.parentElement as HTMLElement);
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toContain("Some stops can't be reached within their window:");
    expect(tip.textContent).toContain('RWS-0042 · ~25 min after its window');
  });

  it('shows no "Route infeasible" indicator when the route is feasible', () => {
    renderRow(makeInspector({ routeFeasible: true }));
    expect(screen.queryByText('Route infeasible')).toBeNull();
  });
});
