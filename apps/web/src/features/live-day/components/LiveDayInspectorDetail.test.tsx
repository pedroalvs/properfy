import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LiveDayInspector } from '@properfy/shared';
import { LiveDayInspectorDetail } from './LiveDayInspectorDetail';
import { makeInspector, makeStop, makeAlert } from '../test-support/fixtures';

function renderDetail(inspector: LiveDayInspector, opts?: { isPastDay?: boolean; onBack?: () => void }) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LiveDayInspectorDetail
        inspector={inspector}
        timezone="Australia/Sydney"
        isPastDay={opts?.isPastDay ?? false}
        onBack={opts?.onBack ?? (() => {})}
      />
    </MemoryRouter>,
  );
}

describe('LiveDayInspectorDetail', () => {
  it('renders the heading with name, state, progress and delay', () => {
    renderDetail(makeInspector({ inspectorName: 'Jane Doe', state: 'AT_PROPERTY', delayMinutes: 22 }));
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Jane Doe');
    expect(heading).toHaveTextContent('At a property');
    expect(heading).toHaveTextContent('1 of 3 done · +22 min');
  });

  it('shows a check-out last-known location with the property address', () => {
    renderDetail(
      makeInspector({
        lastKnown: { source: 'CHECK_OUT', lat: -33.88, lng: 151.21, at: '2026-11-05T09:41:00+11:00', appointmentId: 'stop-a', label: null },
        stops: [makeStop({ appointmentId: 'stop-a', propertyAddress: '12 King St', suburb: 'Surry Hills' })],
      }),
    );
    expect(screen.getByText('Last known location: check-out at 9:41 am · 12 King St, Surry Hills')).toBeInTheDocument();
  });

  it('shows the base and start-of-day last-known variants', () => {
    renderDetail(
      makeInspector({ lastKnown: { source: 'BASE', lat: 0, lng: 0, at: null, appointmentId: null, label: null } }),
    );
    expect(screen.getByText('Last known location: base (no check-in yet)')).toBeInTheDocument();

    renderDetail(
      makeInspector({ lastKnown: { source: 'BASE', lat: 0, lng: 0, at: null, appointmentId: null, label: 'Start of day' } }),
    );
    expect(screen.getByText("Last known location: today's start address (no check-in yet)")).toBeInTheDocument();
  });

  it('composes the alert list and the stop list', () => {
    renderDetail(
      makeInspector({
        alerts: [makeAlert({ type: 'CANT_DO', appointmentId: 'x', appointmentCode: 'INS-0045', reasonLabel: 'No answer at the door' })],
        stops: [makeStop({ appointmentId: 'stop-a', appointmentCode: 'INS-0042' })],
      }),
    );
    expect(screen.getByRole('list', { name: 'Alerts' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Stops' })).toBeInTheDocument();
  });

  it('has a "Back to all inspectors" button', () => {
    const onBack = vi.fn();
    renderDetail(makeInspector(), { onBack });
    expect(screen.getByRole('button', { name: /back to all inspectors/i })).toBeInTheDocument();
  });

  it('links to the inspector profile for the alert-limit override (L-F05-14)', () => {
    renderDetail(makeInspector({ inspectorId: 'insp-9', inspectorName: 'Jane Doe' }));
    const link = screen.getByRole('link', { name: 'Open inspector' });
    expect(link).toHaveAttribute('href', '/inspectors?open=insp-9');
    expect(
      screen.getByText('Alert limits for this inspector are set in their profile'),
    ).toBeInTheDocument();
  });
});
