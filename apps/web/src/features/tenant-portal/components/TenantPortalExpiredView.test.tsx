import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentStatus, TenantConfirmationStatus } from '@properfy/shared';
import { TenantPortalExpiredView } from './TenantPortalExpiredView';
import type { PortalAppointment } from '../types';

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

describe('TenantPortalExpiredView', () => {
  it('shows the expired deadline banner', () => {
    render(<TenantPortalExpiredView appointment={MOCK_APPOINTMENT} />);

    expect(
      screen.getByText('The confirmation deadline has passed.'),
    ).toBeInTheDocument();
  });

  it('shows appointment info card', () => {
    render(<TenantPortalExpiredView appointment={MOCK_APPOINTMENT} />);

    expect(screen.getByText('Appointment Details')).toBeInTheDocument();
    expect(screen.getByText('09:00-11:00')).toBeInTheDocument();
  });

  it('shows existing response when provided', () => {
    render(
      <TenantPortalExpiredView
        appointment={MOCK_APPOINTMENT}
        existingResponse={{
          type: 'CONFIRMED',
          createdAt: '2026-04-10T10:00:00Z',
          summary: 'Tenant confirmed attendance',
        }}
      />,
    );

    expect(screen.getByText('Your Response')).toBeInTheDocument();
    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
    expect(
      screen.getByText('Tenant confirmed attendance'),
    ).toBeInTheDocument();
  });

  it('does not show response section when no existing response', () => {
    render(<TenantPortalExpiredView appointment={MOCK_APPOINTMENT} />);

    expect(screen.queryByText('Your Response')).not.toBeInTheDocument();
  });

  it('shows agency contact phone when provided', () => {
    render(
      <TenantPortalExpiredView
        appointment={MOCK_APPOINTMENT}
        agencyPhone="+61 2 1234 5678"
      />,
    );

    expect(screen.getByText('+61 2 1234 5678')).toBeInTheDocument();
    expect(screen.getByText(/Contact the agency/)).toBeInTheDocument();
  });

  it('does not show agency phone section when not provided', () => {
    render(<TenantPortalExpiredView appointment={MOCK_APPOINTMENT} />);

    expect(screen.queryByText(/Contact the agency/)).not.toBeInTheDocument();
  });
});
