import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentStatus, RentalTenantConfirmationStatus } from '@properfy/shared';
import { RentalTenantPortalExpiredView } from './RentalTenantPortalExpiredView';
import type { PortalAppointment } from '../types';

const MOCK_APPOINTMENT: PortalAppointment = {
  id: 'apt-1',
  status: AppointmentStatus.SCHEDULED,
  scheduledDate: '2026-04-15',
  timeSlotStart: '09:00', timeSlotEnd: '11:00',
  serviceTypeId: 'svc-1',
  rentalTenantConfirmationStatus: RentalTenantConfirmationStatus.PENDING,
  keyRequired: false,
  meetingLocation: null,
  notes: null,
};

describe('RentalTenantPortalExpiredView', () => {
  it('shows the expired deadline banner', () => {
    render(<RentalTenantPortalExpiredView appointment={MOCK_APPOINTMENT} />);

    expect(
      screen.getByText('The confirmation deadline has passed. Contact the agency directly for any changes.'),
    ).toBeInTheDocument();
  });

  it('shows appointment info card', () => {
    render(<RentalTenantPortalExpiredView appointment={MOCK_APPOINTMENT} />);

    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('9:00 am – 11:00 am')).toBeInTheDocument();
  });

  it('shows existing response when provided', () => {
    render(
      <RentalTenantPortalExpiredView
        appointment={MOCK_APPOINTMENT}
        existingResponse={{
          type: 'CONFIRMED',
          createdAt: '2026-04-10T10:00:00Z',
          summary: 'Tenant confirmed attendance',
        }}
      />,
    );

    expect(screen.getByText('Your Response')).toBeInTheDocument();
    // WI-W6 (#660): a user-facing label, not the raw enum.
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.queryByText('CONFIRMED')).not.toBeInTheDocument();
    expect(
      screen.getByText('Tenant confirmed attendance'),
    ).toBeInTheDocument();
  });

  it('renders the UNAVAILABLE response with its user-facing label (#660)', () => {
    render(
      <RentalTenantPortalExpiredView
        appointment={MOCK_APPOINTMENT}
        existingResponse={{ type: 'UNAVAILABLE', createdAt: '2026-04-10T10:00:00Z' }}
      />,
    );

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('UNAVAILABLE')).not.toBeInTheDocument();
  });

  it('falls back to the raw type for an unknown response value', () => {
    render(
      <RentalTenantPortalExpiredView
        appointment={MOCK_APPOINTMENT}
        existingResponse={{ type: 'SOMETHING_NEW', createdAt: '2026-04-10T10:00:00Z' }}
      />,
    );

    expect(screen.getByText('SOMETHING_NEW')).toBeInTheDocument();
  });

  it('does not show response section when no existing response', () => {
    render(<RentalTenantPortalExpiredView appointment={MOCK_APPOINTMENT} />);

    expect(screen.queryByText('Your Response')).not.toBeInTheDocument();
  });

  it('shows agency contact phone when provided', () => {
    render(
      <RentalTenantPortalExpiredView
        appointment={MOCK_APPOINTMENT}
        agencyPhone="+61 2 1234 5678"
      />,
    );

    expect(screen.getByText('+61 2 1234 5678')).toBeInTheDocument();
    expect(screen.getByText(/Need help\? Contact the agency at/)).toBeInTheDocument();
  });

  it('does not show agency phone section when not provided', () => {
    render(<RentalTenantPortalExpiredView appointment={MOCK_APPOINTMENT} />);

    expect(screen.queryByText(/Need help\? Contact the agency at/)).not.toBeInTheDocument();
  });
});
