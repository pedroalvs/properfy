import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RentalTenantPortalAction } from '@properfy/shared';
import { AppointmentPortalActivityTab } from './AppointmentPortalActivityTab';

const mockActivities = [
  {
    id: 'pa-01',
    appointmentId: 'apt-01',
    rentalTenantPortalTokenId: 'tok-1',
    action: 'CONFIRM',
    previousValuesJson: null,
    newValuesJson: null,
    ipAddress: '192.168.1.1',
    userAgent: 'Chrome/120',
    createdAt: '2026-03-10T10:00:00Z',
  },
];

/**
 * Derived from the enum, not restated: a hardcoded list silently stops covering
 * new actions the moment one is added, which is exactly how SURVEY_SUBMITTED
 * would have shipped with a styled badge and no test exercising it.
 */
const ALL_ACTIONS = Object.values(RentalTenantPortalAction);

const allActionActivities = ALL_ACTIONS.map((action, i) => ({
  id: `pa-all-${i}`,
  appointmentId: 'apt-01',
  rentalTenantPortalTokenId: 'tok-1',
  action,
  previousValuesJson: null,
  newValuesJson: null,
  ipAddress: null,
  userAgent: null,
  createdAt: '2026-03-10T10:00:00Z',
}));

const unavailableActivity = {
  id: 'pa-03',
  appointmentId: 'apt-01',
  rentalTenantPortalTokenId: 'tok-1',
  action: 'UNAVAILABLE_REPORTED',
  previousValuesJson: { rentalTenantConfirmationStatus: 'PENDING' },
  newValuesJson: {
    rentalTenantConfirmationStatus: 'UNAVAILABLE',
    availableSlotsJson: [
      { dayOfWeek: 'MON', start: '09:00', end: '17:00' },
      { dayOfWeek: 'WED', start: '10:00', end: '14:00' },
    ],
  },
  ipAddress: null,
  userAgent: null,
  createdAt: '2026-03-12T10:00:00Z',
};

const groupJoinActivity = {
  id: 'pa-02',
  appointmentId: 'apt-01',
  rentalTenantPortalTokenId: 'tok-1',
  action: 'GROUP_JOIN',
  previousValuesJson: null,
  newValuesJson: {
    serviceGroupId: 'sg-1',
    scheduledDate: '2026-06-01',
    timeSlot: '09:00-12:00',
    rentalTenantConfirmationStatus: 'CONFIRMED',
  },
  ipAddress: null,
  userAgent: null,
  createdAt: '2026-03-11T10:00:00Z',
};

vi.mock('../hooks/usePortalActivities', () => ({
  usePortalActivities: (id: string) => {
    if (id === 'loading') return { activities: [], isLoading: true, isError: false, refetch: vi.fn() };
    if (id === 'error') return { activities: [], isLoading: false, isError: true, refetch: vi.fn() };
    if (id === 'empty') return { activities: [], isLoading: false, isError: false, refetch: vi.fn() };
    if (id === 'group-join') return { activities: [groupJoinActivity], isLoading: false, isError: false, refetch: vi.fn() };
    if (id === 'all-actions') return { activities: allActionActivities, isLoading: false, isError: false, refetch: vi.fn() };
    if (id === 'unavailable') return { activities: [unavailableActivity], isLoading: false, isError: false, refetch: vi.fn() };
    return { activities: mockActivities, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

describe('AppointmentPortalActivityTab', () => {
  it('renders activity entry', () => {
    render(<AppointmentPortalActivityTab appointmentId="apt-01" />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText(/192\.168\.1\.1/)).toBeInTheDocument();
    expect(screen.getByText('Chrome/120')).toBeInTheDocument();
  });

  /**
   * The badge map used to be keyed on invented values (CONFIRMED / RESCHEDULED /
   * UNAVAILABLE) that the backend never emits, so four of the six real action types
   * silently fell through to the generic grey `mdi-account` badge.
   */
  it('gives every real action type its own icon, never the generic fallback', () => {
    const { container } = render(<AppointmentPortalActivityTab appointmentId="all-actions" />);

    const icons = Array.from(container.querySelectorAll('i.mdi')).map((el) =>
      Array.from(el.classList).find((c) => c.startsWith('mdi-')),
    );

    expect(icons).toHaveLength(ALL_ACTIONS.length);
    expect(icons).not.toContain('mdi-account');
    expect(new Set(icons).size).toBe(ALL_ACTIONS.length);
  });

  it('labels every real action type readably', () => {
    render(<AppointmentPortalActivityTab appointmentId="all-actions" />);
    ['View', 'Confirm', 'Reschedule', 'Contact Updated', 'Unavailable Reported', 'Group Join'].forEach(
      (label) => expect(screen.getByText(label)).toBeInTheDocument(),
    );
  });

  it('shows loading state', () => {
    render(<AppointmentPortalActivityTab appointmentId="loading" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<AppointmentPortalActivityTab appointmentId="error" />);
    expect(screen.getByText('Failed to load portal activities')).toBeInTheDocument();
  });

  it('shows empty state when no activities', () => {
    render(<AppointmentPortalActivityTab appointmentId="empty" />);
    expect(screen.getByText('No portal activity')).toBeInTheDocument();
    expect(screen.getByText('No tenant portal interactions have been recorded yet.')).toBeInTheDocument();
  });

  it('renders GROUP_JOIN activity with a colour badge', () => {
    render(<AppointmentPortalActivityTab appointmentId="group-join" />);
    expect(screen.getByText('Group Join')).toBeInTheDocument();
  });

  it('renders GROUP_JOIN newValuesJson summary with date and time slot', () => {
    render(<AppointmentPortalActivityTab appointmentId="group-join" />);
    expect(screen.getByText(/2026-06-01/)).toBeInTheDocument();
    expect(screen.getByText(/09:00-12:00/)).toBeInTheDocument();
  });

  // report-unavailability writes the tenant's weekly availability into the activity's
  // newValuesJson, so it is already on the wire here — only the renderer was missing.
  it('renders the availability the tenant offered on an UNAVAILABLE_REPORTED entry', () => {
    render(<AppointmentPortalActivityTab appointmentId="unavailable" />);
    expect(screen.getByText('Unavailable Reported')).toBeInTheDocument();
    expect(screen.getByText('Mon 09:00 - 17:00')).toBeInTheDocument();
    expect(screen.getByText('Wed 10:00 - 14:00')).toBeInTheDocument();
  });
});
