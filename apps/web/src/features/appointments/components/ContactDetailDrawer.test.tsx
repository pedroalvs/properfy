import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContactDetailDrawer } from './ContactDetailDrawer';

const mockContact = {
  id: 'ct-01',
  appointmentId: 'apt-01',
  name: 'John Smith',
  primaryEmail: 'john@example.com',
  primaryPhone: '+61400000000',
  confirmationStatus: 'CONFIRMED',
  propertyAddress: '123 Main St, Sydney',
  appointmentDate: '2026-04-01',
  lastActivityAt: '2026-03-15T14:00:00Z',
  createdAt: '2026-03-10T10:00:00Z',
  updatedAt: '2026-03-15T14:00:00Z',
  alternativePhone: '+61400111222',
  notes: 'Preferred morning inspections',
};

vi.mock('../hooks/useAppointmentContactDetail', () => ({
  useAppointmentContactDetail: (id: string | null) => {
    if (!id) return { contact: null, isLoading: false, isError: false, refetch: vi.fn() };
    if (id === 'loading') return { contact: null, isLoading: true, isError: false, refetch: vi.fn() };
    if (id === 'error') return { contact: null, isLoading: false, isError: true, refetch: vi.fn() };
    return { contact: mockContact, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

vi.mock('@/components/ui/DrawerPanel', () => ({
  DrawerPanel: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="drawer">{children}</div> : null,
}));

vi.mock('./TenantConfirmationChip', () => ({
  TenantConfirmationChip: ({ status }: { status: string }) => <span>{status}</span>,
}));

describe('ContactDetailDrawer', () => {
  it('renders nothing when contactId is null', () => {
    render(<ContactDetailDrawer contactId={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId('drawer')).not.toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<ContactDetailDrawer contactId="loading" onClose={vi.fn()} />);
    expect(screen.getByTestId('drawer')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<ContactDetailDrawer contactId="error" onClose={vi.fn()} />);
    expect(screen.getByText('Failed to load contact')).toBeInTheDocument();
  });

  it('shows contact details', () => {
    render(<ContactDetailDrawer contactId="ct-01" onClose={vi.fn()} />);
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('+61400000000')).toBeInTheDocument();
    expect(screen.getByText('+61400111222')).toBeInTheDocument();
    expect(screen.getByText('123 Main St, Sydney')).toBeInTheDocument();
    expect(screen.getByText('Preferred morning inspections')).toBeInTheDocument();
    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
  });
});
