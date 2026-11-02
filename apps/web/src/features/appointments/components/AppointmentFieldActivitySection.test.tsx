import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AppointmentFieldActivityResponse } from '@properfy/shared';
import { AppointmentFieldActivitySection } from './AppointmentFieldActivitySection';
import type { UseAppointmentFieldActivityReturn } from '../hooks/useAppointmentFieldActivity';

const mockUseFieldActivity = vi.fn<[], UseAppointmentFieldActivityReturn>();
vi.mock('../hooks/useAppointmentFieldActivity', () => ({
  useAppointmentFieldActivity: () => mockUseFieldActivity(),
}));

function setHook(partial: Partial<UseAppointmentFieldActivityReturn>) {
  mockUseFieldActivity.mockReturnValue({
    fieldActivity: null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...partial,
  });
}

const fullExecution: AppointmentFieldActivityResponse['execution'] = {
  id: 'exec-1',
  inspectorName: 'Jane Doe',
  startedAt: '2026-11-03T09:00:00+11:00',
  finishedAt: '2026-11-03T09:40:00+11:00',
  abandonedAt: null,
  startClientAt: null,
  finishClientAt: null,
  startDistanceMeters: 120,
  finishDistanceMeters: 95,
  startAccuracyMeters: 8,
  finishAccuracyMeters: 10,
  outOfRadius: false,
  outOfWindow: false,
  finishOutOfRadius: false,
  geofenceRadiusMeters: 300,
};

beforeEach(() => mockUseFieldActivity.mockReset());

describe('AppointmentFieldActivitySection', () => {
  it('renders a loading skeleton', () => {
    setHook({ isLoading: true });
    const { container } = render(<AppointmentFieldActivitySection appointmentId="apt-1" />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it('renders an error state with retry', () => {
    const refetch = vi.fn();
    setHook({ isError: true, refetch });
    render(<AppointmentFieldActivitySection appointmentId="apt-1" />);
    expect(screen.getByText("Couldn't load field activity")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders the empty state when there is no execution and no events', () => {
    setHook({ fieldActivity: { execution: null, events: [] } });
    render(<AppointmentFieldActivitySection appointmentId="apt-1" />);
    expect(screen.getByText('No field activity yet.')).toBeInTheDocument();
  });

  it('renders check-in/out rows with distance and accuracy for an operator', () => {
    setHook({ fieldActivity: { execution: fullExecution, events: [] } });
    render(<AppointmentFieldActivitySection appointmentId="apt-1" />);
    expect(screen.getByText('Checked in')).toBeInTheDocument();
    expect(screen.getByText('Checked out')).toBeInTheDocument();
    expect(screen.getByText('Distance at check-in: 120 m (accuracy ±8 m)')).toBeInTheDocument();
    expect(screen.getByText('Distance at check-out: 95 m (accuracy ±10 m)')).toBeInTheDocument();
    // No external map link anywhere.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders flag chips when the flags are set', () => {
    setHook({
      fieldActivity: {
        execution: { ...fullExecution, outOfRadius: true, outOfWindow: true, finishOutOfRadius: true },
        events: [],
      },
    });
    render(<AppointmentFieldActivitySection appointmentId="apt-1" />);
    expect(screen.getByText('Outside geofence (300 m)')).toBeInTheDocument();
    expect(screen.getByText('Outside time window')).toBeInTheDocument();
    expect(screen.getByText('Checked out outside geofence')).toBeInTheDocument();
  });

  it('shows "Property has no coordinates" when distance is null', () => {
    setHook({
      fieldActivity: {
        execution: { ...fullExecution, startDistanceMeters: null, startAccuracyMeters: null },
        events: [],
      },
    });
    render(<AppointmentFieldActivitySection appointmentId="apt-1" />);
    expect(screen.getByText('Distance at check-in: Property has no coordinates')).toBeInTheDocument();
  });

  it('renders the abandoned row and chip when the execution was abandoned', () => {
    setHook({
      fieldActivity: {
        execution: { ...fullExecution, finishedAt: null, abandonedAt: '2026-11-03T10:05:00+11:00' },
        events: [],
      },
    });
    render(<AppointmentFieldActivitySection appointmentId="apt-1" />);
    expect(screen.getByText('Check-in abandoned')).toBeInTheDocument();
    expect(screen.getByText('Abandoned')).toBeInTheDocument();
  });

  it('shows a "Device time … (synced later)" note when the client time differs by more than 2 minutes', () => {
    setHook({
      fieldActivity: {
        execution: {
          ...fullExecution,
          startedAt: '2026-11-03T09:40:00+11:00',
          startClientAt: '2026-11-03T09:00:00+11:00',
        },
        events: [],
      },
    });
    render(<AppointmentFieldActivitySection appointmentId="apt-1" />);
    // Clock value is timezone-dependent, so assert the shape, not the digits.
    expect(screen.getByText(/Device time \d{1,2}:\d{2} \(synced later\)/)).toBeInTheDocument();
  });

  it('does not show the device-time note when the client and server times are within 2 minutes', () => {
    setHook({
      fieldActivity: {
        execution: {
          ...fullExecution,
          startedAt: '2026-11-03T09:00:00+11:00',
          startClientAt: '2026-11-03T09:01:00+11:00',
        },
        events: [],
      },
    });
    render(<AppointmentFieldActivitySection appointmentId="apt-1" />);
    expect(screen.queryByText(/synced later/)).not.toBeInTheDocument();
  });

  it('lists field events in the given order with type, reason and late minutes', () => {
    setHook({
      fieldActivity: {
        execution: null,
        events: [
          {
            id: 'ev-1',
            type: 'CANT_DO',
            reason: 'KEY_FAILED',
            note: 'Lockbox jammed',
            minutesLate: null,
            inspectorName: 'Jane Doe',
            occurredAt: '2026-11-03T09:10:00+11:00',
            clientOccurredAt: null,
            accuracyMeters: null,
          },
          {
            id: 'ev-2',
            type: 'LATE_NOTICE',
            reason: 'TRAFFIC',
            note: null,
            minutesLate: 20,
            inspectorName: 'Jane Doe',
            occurredAt: '2026-11-03T08:40:00+11:00',
            clientOccurredAt: null,
            accuracyMeters: null,
          },
        ],
      },
    });
    render(<AppointmentFieldActivitySection appointmentId="apt-1" />);
    expect(screen.getByText(/Can't do this job — Key didn't work/)).toBeInTheDocument();
    expect(screen.getByText(/Running late — Traffic, ~20 min/)).toBeInTheDocument();
  });

  // ── CL privacy cut ──────────────────────────────────────────────────────
  it('renders distance and flags for a CL payload with no coordinates in the DOM', () => {
    setHook({
      fieldActivity: {
        execution: { ...fullExecution, outOfRadius: true },
        events: [],
      },
    });
    const { container } = render(<AppointmentFieldActivitySection appointmentId="apt-1" />);
    expect(screen.getByText('Distance at check-in: 120 m (accuracy ±8 m)')).toBeInTheDocument();
    expect(screen.getByText('Outside geofence (300 m)')).toBeInTheDocument();
    // No latitude/longitude value present.
    expect(container.textContent).not.toMatch(/-?\d{1,3}\.\d{4,}/);
  });

  // This FAILS if the component ever starts rendering a coordinate field: the
  // payload carries raw coordinates (as an AM/OP payload would), yet none may
  // reach the DOM — the component must not read lat/lng at all.
  it('never renders inspector coordinates even when the payload carries them', () => {
    setHook({
      fieldActivity: {
        execution: {
          ...fullExecution,
          startLatitude: -33.8688,
          startLongitude: 151.2093,
          finishLatitude: -33.869,
          finishLongitude: 151.21,
        },
        events: [
          {
            id: 'ev-coord',
            type: 'CANT_DO',
            reason: 'UNSAFE',
            note: null,
            minutesLate: null,
            inspectorName: 'Jane Doe',
            occurredAt: '2026-11-03T09:10:00+11:00',
            clientOccurredAt: null,
            accuracyMeters: 12,
            latitude: -33.8688,
            longitude: 151.2093,
          },
        ],
      },
    });
    const { container } = render(<AppointmentFieldActivitySection appointmentId="apt-1" />);
    expect(container.textContent).not.toContain('-33.8688');
    expect(container.textContent).not.toContain('151.2093');
    expect(container.textContent).not.toMatch(/-?\d{1,3}\.\d{4,}/);
  });
});
