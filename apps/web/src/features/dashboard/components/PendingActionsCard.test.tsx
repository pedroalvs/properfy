import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PendingActionsCard } from './PendingActionsCard';

describe('PendingActionsCard', () => {
  const defaultProps = {
    noResponseTenants: 5,
    pendingFinancialEntries: 12,
    processingReports: 3,
  };

  it('renders section title "Pending Actions"', () => {
    render(<PendingActionsCard {...defaultProps} />);
    expect(screen.getByText('Pending Actions')).toBeInTheDocument();
  });

  it('renders three action items', () => {
    render(<PendingActionsCard {...defaultProps} />);
    const items = screen.getAllByTestId('pending-action-item');
    expect(items).toHaveLength(3);
  });

  it('renders correct descriptions', () => {
    render(<PendingActionsCard {...defaultProps} />);
    expect(screen.getByText('No-response tenants')).toBeInTheDocument();
    expect(screen.getByText('Pending financial entries')).toBeInTheDocument();
    expect(screen.getByText('Reports processing')).toBeInTheDocument();
  });

  it('renders correct counts as badge text', () => {
    render(<PendingActionsCard {...defaultProps} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders zero counts', () => {
    render(
      <PendingActionsCard
        noResponseTenants={0}
        pendingFinancialEntries={0}
        processingReports={0}
      />,
    );
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(3);
  });
});
