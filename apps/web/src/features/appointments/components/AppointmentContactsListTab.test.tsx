import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentContactsListTab } from './AppointmentContactsListTab';

const mockContacts = [
  {
    id: 'ct-01',
    appointmentId: 'apt-01',
    name: 'John Smith',
    primaryEmail: 'john@example.com',
    primaryPhone: '+61400000000',
    confirmationStatus: 'PENDING',
    propertyAddress: '123 Main St, Sydney',
    appointmentDate: '2026-04-01',
    lastActivityAt: null,
    createdAt: '2026-03-10T10:00:00Z',
    updatedAt: '2026-03-10T10:00:00Z',
  },
];

vi.mock('../hooks/useAppointmentContacts', () => ({
  useAppointmentContacts: (tenantId: string) => {
    if (tenantId === 'loading') return { contacts: [], isLoading: true, isError: false, refetch: vi.fn() };
    if (tenantId === 'error') return { contacts: [], isLoading: false, isError: true, refetch: vi.fn() };
    if (tenantId === 'empty') return { contacts: [], isLoading: false, isError: false, refetch: vi.fn() };
    return { contacts: mockContacts, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

vi.mock('./ContactDetailDrawer', () => ({
  ContactDetailDrawer: () => null,
}));

vi.mock('./TenantConfirmationChip', () => ({
  TenantConfirmationChip: ({ status }: { status: string }) => <span>{status}</span>,
}));

describe('AppointmentContactsListTab', () => {
  it('renders contacts list', () => {
    render(<AppointmentContactsListTab tenantId="ten-01" />);
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('123 Main St, Sydney')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<AppointmentContactsListTab tenantId="loading" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<AppointmentContactsListTab tenantId="error" />);
    expect(screen.getByText('Failed to load contacts')).toBeInTheDocument();
  });

  it('shows empty state when no contacts', () => {
    render(<AppointmentContactsListTab tenantId="empty" />);
    expect(screen.getByText('No contacts')).toBeInTheDocument();
    expect(screen.getByText('No appointment contacts found.')).toBeInTheDocument();
  });
});
