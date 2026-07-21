import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentTimelineTab } from './AppointmentTimelineTab';

const mockEntries = [
  {
    id: 'log-01',
    tenantId: 'ten-1',
    actorType: 'USER',
    actorId: 'usr-1',
    entityType: 'APPOINTMENT',
    entityId: 'apt-01',
    action: 'appointment.create',
    reason: null,
    beforeJson: null,
    afterJson: { status: 'DRAFT' },
    requestId: 'req-1',
    ipAddress: null,
    metadataJson: null,
    createdAt: '2026-03-10T10:00:00Z',
  },
];

vi.mock('../hooks/useAppointmentAuditLog', () => ({
  useAppointmentAuditLog: (id: string) => {
    if (id === 'loading') return { entries: [], isLoading: true, isError: false, refetch: vi.fn() };
    if (id === 'error')
      return {
        entries: [],
        isLoading: false,
        isError: true,
        error: { error: { code: 'FORBIDDEN', message: 'You cannot view this appointment audit log' } },
        refetch: vi.fn(),
      };
    if (id === 'empty') return { entries: [], isLoading: false, isError: false, refetch: vi.fn() };
    return { entries: mockEntries, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

describe('AppointmentTimelineTab', () => {
  it('renders timeline entries', () => {
    render(<AppointmentTimelineTab appointmentId="apt-01" />);
    expect(screen.getByText('Appointment Create')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<AppointmentTimelineTab appointmentId="loading" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error state with the backend message as detail', () => {
    render(<AppointmentTimelineTab appointmentId="error" />);
    expect(screen.getByText('Failed to load audit log')).toBeInTheDocument();
    expect(screen.getByText('You cannot view this appointment audit log')).toBeInTheDocument();
  });

  it('shows empty state when no entries', () => {
    render(<AppointmentTimelineTab appointmentId="empty" />);
    expect(screen.getByText('No audit entries')).toBeInTheDocument();
  });
});
