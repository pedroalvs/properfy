import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentPortalActivityTab } from './AppointmentPortalActivityTab';

const mockActivities = [
  {
    id: 'pa-01',
    appointmentId: 'apt-01',
    tenantPortalTokenId: 'tok-1',
    action: 'CONFIRMED',
    previousValuesJson: null,
    newValuesJson: null,
    ipAddress: '192.168.1.1',
    userAgent: 'Chrome/120',
    createdAt: '2026-03-10T10:00:00Z',
  },
];

vi.mock('../hooks/usePortalActivities', () => ({
  usePortalActivities: (id: string) => {
    if (id === 'loading') return { activities: [], isLoading: true, isError: false, refetch: vi.fn() };
    if (id === 'error') return { activities: [], isLoading: false, isError: true, refetch: vi.fn() };
    if (id === 'empty') return { activities: [], isLoading: false, isError: false, refetch: vi.fn() };
    return { activities: mockActivities, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

describe('AppointmentPortalActivityTab', () => {
  it('renders activity entry', () => {
    render(<AppointmentPortalActivityTab appointmentId="apt-01" />);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText(/192\.168\.1\.1/)).toBeInTheDocument();
    expect(screen.getByText('Chrome/120')).toBeInTheDocument();
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
});
