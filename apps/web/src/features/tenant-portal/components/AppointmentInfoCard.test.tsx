import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentStatus, TenantConfirmationStatus } from '@properfy/shared';
import type { PortalAppointment } from '../types';

// Mock StatusChip to avoid its internal dependencies
vi.mock('@/components/ui/StatusChip', () => ({
  StatusChip: ({ status }: { status: string }) => <span data-testid="status-chip">{status}</span>,
}));

// Mock useCountdown to control countdown state
const mockCountdown = { hours: 0, minutes: 0, isExpired: true, isUrgent: false, isCritical: false, label: '' };
vi.mock('../hooks/useCountdown', () => ({
  useCountdown: () => mockCountdown,
}));

import { AppointmentInfoCard } from './AppointmentInfoCard';

const MOCK_APPOINTMENT: PortalAppointment = {
  id: 'apt-1',
  status: AppointmentStatus.SCHEDULED,
  scheduledDate: '2026-04-15',
  timeSlot: '09:00-11:00',
  serviceTypeId: 'svc-1',
  tenantConfirmationStatus: TenantConfirmationStatus.PENDING,
  keyRequired: false,
  meetingLocation: null,
  notes: null,
};

describe('AppointmentInfoCard', () => {
  beforeEach(() => {
    Object.assign(mockCountdown, { hours: 0, minutes: 0, isExpired: true, isUrgent: false, isCritical: false, label: '' });
  });

  it('renders the title', () => {
    render(<AppointmentInfoCard appointment={MOCK_APPOINTMENT} />);

    expect(screen.getByText('Appointment Details')).toBeInTheDocument();
  });

  it('renders appointment status chip', () => {
    render(<AppointmentInfoCard appointment={MOCK_APPOINTMENT} />);

    expect(screen.getByTestId('status-chip')).toHaveTextContent('SCHEDULED');
  });

  it('renders scheduled date', () => {
    render(<AppointmentInfoCard appointment={MOCK_APPOINTMENT} />);

    expect(screen.getByText('Scheduled Date')).toBeInTheDocument();
    // formatDate uses en-AU locale: DD/MM/YYYY
    expect(screen.getByText(/04\/2026|2026/)).toBeInTheDocument();
  });

  it('renders time slot', () => {
    render(<AppointmentInfoCard appointment={MOCK_APPOINTMENT} />);

    expect(screen.getByText('09:00-11:00')).toBeInTheDocument();
  });

  it('renders confirmation status label', () => {
    render(<AppointmentInfoCard appointment={MOCK_APPOINTMENT} />);

    expect(screen.getByText('Confirmation')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('does not show key required when false', () => {
    render(<AppointmentInfoCard appointment={MOCK_APPOINTMENT} />);

    expect(screen.queryByText('Key Required')).not.toBeInTheDocument();
  });

  it('shows key required when true', () => {
    render(
      <AppointmentInfoCard
        appointment={{ ...MOCK_APPOINTMENT, keyRequired: true }}
      />,
    );

    expect(screen.getByText('Key Required')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('shows meeting location when provided', () => {
    render(
      <AppointmentInfoCard
        appointment={{ ...MOCK_APPOINTMENT, meetingLocation: 'Front lobby' }}
      />,
    );

    expect(screen.getByText('Meeting Location')).toBeInTheDocument();
    expect(screen.getByText('Front lobby')).toBeInTheDocument();
  });

  it('does not show meeting location when null', () => {
    render(<AppointmentInfoCard appointment={MOCK_APPOINTMENT} />);

    expect(screen.queryByText('Meeting Location')).not.toBeInTheDocument();
  });

  it('shows notes when provided', () => {
    render(
      <AppointmentInfoCard
        appointment={{ ...MOCK_APPOINTMENT, notes: 'Ring doorbell twice' }}
      />,
    );

    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Ring doorbell twice')).toBeInTheDocument();
  });

  it('does not show notes when null', () => {
    render(<AppointmentInfoCard appointment={MOCK_APPOINTMENT} />);

    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
  });

  it('shows countdown when deadline is urgent and not expired', () => {
    Object.assign(mockCountdown, { hours: 2, minutes: 30, isExpired: false, isUrgent: true, isCritical: false, label: 'Respond within 2 hours 30 minutes' });

    render(
      <AppointmentInfoCard
        appointment={MOCK_APPOINTMENT}
        deadline="2026-04-15T12:00:00Z"
      />,
    );

    expect(screen.getByRole('status', { name: 'Countdown timer' })).toBeInTheDocument();
    expect(screen.getByText('Respond within 2 hours 30 minutes')).toBeInTheDocument();
  });

  it('shows red styling when countdown is critical', () => {
    Object.assign(mockCountdown, { hours: 1, minutes: 15, isExpired: false, isUrgent: true, isCritical: true, label: 'Respond within 1 hour 15 minutes' });

    render(
      <AppointmentInfoCard
        appointment={MOCK_APPOINTMENT}
        deadline="2026-04-15T12:00:00Z"
      />,
    );

    const countdownEl = screen.getByRole('status', { name: 'Countdown timer' });
    expect(countdownEl).toHaveClass('text-error');
    expect(countdownEl).toHaveClass('bg-error/10');
  });

  it('does not show countdown when expired', () => {
    Object.assign(mockCountdown, { hours: 0, minutes: 0, isExpired: true, isUrgent: true, isCritical: true, label: '' });

    render(
      <AppointmentInfoCard
        appointment={MOCK_APPOINTMENT}
        deadline="2026-04-14T12:00:00Z"
      />,
    );

    expect(screen.queryByRole('status', { name: 'Countdown timer' })).not.toBeInTheDocument();
  });

  it('does not show countdown when no deadline', () => {
    render(<AppointmentInfoCard appointment={MOCK_APPOINTMENT} />);

    expect(screen.queryByRole('status', { name: 'Countdown timer' })).not.toBeInTheDocument();
  });
});
