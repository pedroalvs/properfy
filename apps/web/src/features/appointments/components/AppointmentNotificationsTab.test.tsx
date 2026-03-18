import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AppointmentNotificationsTab } from './AppointmentNotificationsTab';

const mockNotifications = [
  {
    id: 'notif-01',
    channel: 'EMAIL',
    recipient: 'tenant@example.com',
    status: 'SENT',
    sentAt: '2026-03-10T10:00:00Z',
    createdAt: '2026-03-10T09:55:00Z',
  },
];

vi.mock('../hooks/useAppointmentNotifications', () => ({
  useAppointmentNotifications: (id: string) => {
    if (id === 'loading') return { notifications: [], isLoading: true, isError: false, refetch: vi.fn() };
    if (id === 'error') return { notifications: [], isLoading: false, isError: true, refetch: vi.fn() };
    if (id === 'empty') return { notifications: [], isLoading: false, isError: false, refetch: vi.fn() };
    return { notifications: mockNotifications, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

describe('AppointmentNotificationsTab', () => {
  it('renders notification data in table', () => {
    render(<AppointmentNotificationsTab appointmentId="apt-01" />);
    expect(screen.getByText('EMAIL')).toBeInTheDocument();
    expect(screen.getByText('tenant@example.com')).toBeInTheDocument();
    expect(screen.getByText('SENT')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<AppointmentNotificationsTab appointmentId="apt-01" />);
    expect(screen.getByText('Channel')).toBeInTheDocument();
    expect(screen.getByText('Recipient')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Sent At')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<AppointmentNotificationsTab appointmentId="loading" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<AppointmentNotificationsTab appointmentId="error" />);
    expect(screen.getByText('Failed to load notifications')).toBeInTheDocument();
  });

  it('shows empty message when no notifications', () => {
    render(<AppointmentNotificationsTab appointmentId="empty" />);
    expect(screen.getByText('No notifications sent for this appointment')).toBeInTheDocument();
  });
});
