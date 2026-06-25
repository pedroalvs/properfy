import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/useFinancialSummary', () => ({
  useFinancialSummary: vi.fn(),
}));

import { useFinancialSummary } from '../hooks/useFinancialSummary';
import { FinancialSummaryBar } from './FinancialSummaryBar';

const mockUseFinancialSummary = useFinancialSummary as ReturnType<typeof vi.fn>;

describe('FinancialSummaryBar', () => {
  it('renders loading state with skeleton placeholders', () => {
    mockUseFinancialSummary.mockReturnValue({ summary: null, isLoading: true });
    render(<FinancialSummaryBar />);

    expect(screen.getByTestId('financial-summary-bar')).toBeInTheDocument();
    expect(screen.getByText('Approved Debits')).toBeInTheDocument();
    expect(screen.getByText('Approved Payouts')).toBeInTheDocument();
    expect(screen.getByText('Approved Adjustments')).toBeInTheDocument();
    expect(screen.getByText('Approved Refunds')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders summary values when loaded', () => {
    mockUseFinancialSummary.mockReturnValue({
      summary: {
        totalDebits: 5000,
        totalPayouts: 3000,
        totalAdjustments: 200,
        totalRefunds: 150,
        pendingCount: 7,
        currency: 'USD',
      },
      isLoading: false,
    });
    render(<FinancialSummaryBar />);

    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/USD\s*5,?000\.00/)).toBeInTheDocument();
  });

  it('renders zero values when summary is null and not loading', () => {
    mockUseFinancialSummary.mockReturnValue({ summary: null, isLoading: false });
    render(<FinancialSummaryBar />);

    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
