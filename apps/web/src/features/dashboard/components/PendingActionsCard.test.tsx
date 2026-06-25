import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PendingActionsCard } from './PendingActionsCard';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', role: 'AM', tenantId: null } }),
}));

describe('PendingActionsCard', () => {
  const defaultProps = {
    noResponseTenants: 5,
    pendingOperatorCrossChecks: 4,
    pendingFinancialEntries: 12,
    processingReports: 3,
  };

  it('renders section title "Pending Actions"', () => {
    render(<MemoryRouter><PendingActionsCard {...defaultProps} /></MemoryRouter>);
    expect(screen.getByText('Pending Actions')).toBeInTheDocument();
  });

  it('renders four action items', () => {
    render(<MemoryRouter><PendingActionsCard {...defaultProps} /></MemoryRouter>);
    const items = screen.getAllByTestId('pending-action-item');
    expect(items).toHaveLength(4);
  });

  it('renders correct descriptions', () => {
    render(<MemoryRouter><PendingActionsCard {...defaultProps} /></MemoryRouter>);
    expect(screen.getByText('No-response tenants')).toBeInTheDocument();
    expect(screen.getByText('Pending operator cross-checks')).toBeInTheDocument();
    expect(screen.getByText('Pending financial entries')).toBeInTheDocument();
    expect(screen.getByText('Reports processing')).toBeInTheDocument();
  });

  it('renders correct counts as badge text', () => {
    render(<MemoryRouter><PendingActionsCard {...defaultProps} /></MemoryRouter>);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders actionable links to canonical destinations', () => {
    render(<MemoryRouter><PendingActionsCard {...defaultProps} /></MemoryRouter>);

    expect(screen.getByRole('link', { name: /No-response tenants/i })).toHaveAttribute(
      'href',
      '/appointments?tenantConfirmationStatus=NO_RESPONSE',
    );
    expect(screen.getByRole('link', { name: /Pending operator cross-checks/i })).toHaveAttribute(
      'href',
      '/appointments?status=DONE',
    );
    expect(screen.getByRole('link', { name: /Pending financial entries/i })).toHaveAttribute(
      'href',
      '/financial?status=PENDING',
    );
    expect(screen.getByRole('link', { name: /Reports processing/i })).toHaveAttribute(
      'href',
      '/reports?status=PROCESSING',
    );
  });

  it('renders zero counts', () => {
    render(
      <MemoryRouter>
        <PendingActionsCard
          noResponseTenants={0}
          pendingOperatorCrossChecks={0}
          pendingFinancialEntries={0}
          processingReports={0}
        />
      </MemoryRouter>,
    );
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(4);
  });
});
