import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentNotificationsTab } from './AppointmentNotificationsTab';

const mockNotifications = [
  {
    id: 'notif-01',
    templateCode: 'INITIAL_NOTICE',
    channel: 'EMAIL',
    recipient: 'tenant@example.com',
    status: 'SENT',
    sentAt: '2026-03-10T10:00:00Z',
    deliveredAt: '2026-03-10T10:01:00Z',
    failedAt: null,
    failureReason: null,
    retryCount: 0,
    createdAt: '2026-03-10T09:55:00Z',
  },
  {
    id: 'notif-02',
    templateCode: 'REMINDER_T1',
    channel: 'SMS',
    recipient: '+5511999000000',
    status: 'FAILED',
    sentAt: '2026-03-11T14:00:00Z',
    deliveredAt: null,
    failedAt: '2026-03-11T14:02:00Z',
    failureReason: 'Provider timeout',
    retryCount: 2,
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
    expect(screen.getByText('INITIAL_NOTICE')).toBeInTheDocument();
    expect(screen.getByText('EMAIL')).toBeInTheDocument();
    expect(screen.getByText('tenant@example.com')).toBeInTheDocument();
    // UX-baseline cleanup: the local hex `NOTIFICATION_STATUS_COLORS` was
    // replaced by the shared `NOTIFICATION_STATUS_MAP` driving `StatusChip`,
    // which renders the human-readable `label` field instead of the enum.
    expect(screen.getByText('Sent')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<AppointmentNotificationsTab appointmentId="apt-01" />);
    expect(screen.getByText('Template')).toBeInTheDocument();
    expect(screen.getByText('Channel')).toBeInTheDocument();
    expect(screen.getByText('Recipient')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Sent At')).toBeInTheDocument();
    expect(screen.getByText('Delivered / Failed At')).toBeInTheDocument();
    expect(screen.getByText('Failure Reason')).toBeInTheDocument();
    expect(screen.getByText('Retries')).toBeInTheDocument();
  });

  it('renders failure diagnostics when notification failed', () => {
    render(<AppointmentNotificationsTab appointmentId="apt-01" />);
    expect(screen.getByText('REMINDER_T1')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Provider timeout')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
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
