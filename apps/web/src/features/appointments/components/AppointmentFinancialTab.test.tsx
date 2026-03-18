import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentFinancialTab } from './AppointmentFinancialTab';

const mockEntries = [
  {
    id: 'fin-01',
    entryType: 'TENANT_DEBIT',
    amount: 150.0,
    currency: 'BRL',
    status: 'PENDING',
    description: 'Inspection fee',
    relatedEntityName: 'Branch Centro',
    effectiveAt: '2026-03-10T00:00:00Z',
    createdAt: '2026-03-10T10:00:00Z',
  },
];

vi.mock('../hooks/useAppointmentFinancialEntries', () => ({
  useAppointmentFinancialEntries: (id: string) => {
    if (id === 'loading') return { entries: [], isLoading: true, isError: false, refetch: vi.fn() };
    if (id === 'error') return { entries: [], isLoading: false, isError: true, refetch: vi.fn() };
    if (id === 'empty') return { entries: [], isLoading: false, isError: false, refetch: vi.fn() };
    return { entries: mockEntries, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

vi.mock('@/features/financial/components/FinancialEntryTypeChip', () => ({
  FinancialEntryTypeChip: ({ entryType }: { entryType: string }) => (
    <span data-testid="entry-type-chip">{entryType}</span>
  ),
}));

vi.mock('@/features/financial/components/FinancialStatusChip', () => ({
  FinancialStatusChip: ({ status }: { status: string }) => (
    <span data-testid="status-chip">{status}</span>
  ),
}));

describe('AppointmentFinancialTab', () => {
  it('renders financial entry data in table', () => {
    render(<AppointmentFinancialTab appointmentId="apt-01" />);
    expect(screen.getByText('TENANT_DEBIT')).toBeInTheDocument();
    expect(screen.getByText('Inspection fee')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<AppointmentFinancialTab appointmentId="apt-01" />);
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Effective Date')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<AppointmentFinancialTab appointmentId="loading" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<AppointmentFinancialTab appointmentId="error" />);
    expect(screen.getByText('Failed to load financial entries')).toBeInTheDocument();
  });

  it('shows empty message when no entries', () => {
    render(<AppointmentFinancialTab appointmentId="empty" />);
    expect(screen.getByText('No financial entries for this appointment')).toBeInTheDocument();
  });
});
