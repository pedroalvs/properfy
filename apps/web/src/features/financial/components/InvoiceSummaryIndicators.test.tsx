import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvoiceSummaryIndicators } from './InvoiceSummaryIndicators';

const SUMMARY = {
  currency: 'AUD',
  totalCount: 10,
  pendingCount: 4,
  approvedCount: 3,
  paidCount: 2,
  voidCount: 1,
  pendingAmount: 1200.5,
  paidAmount: 800,
};

describe('InvoiceSummaryIndicators', () => {
  it('renders the five indicators with values', () => {
    render(<InvoiceSummaryIndicators summary={SUMMARY} />);

    expect(screen.getByTestId('invoice-summary-indicators')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Pending Amount')).toBeInTheDocument();
    expect(screen.getByText('$1,200.50')).toBeInTheDocument();
    expect(screen.getByText('Paid Amount')).toBeInTheDocument();
    expect(screen.getByText('$800.00')).toBeInTheDocument();
  });

  it('renders zeros when summary is null', () => {
    render(<InvoiceSummaryIndicators summary={null} />);
    expect(screen.getAllByText('0')).toHaveLength(3);
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('renders a multi-currency notice instead of cards', () => {
    render(
      <InvoiceSummaryIndicators
        summary={null}
        multiCurrencyError={{
          code: 'MULTI_CURRENCY_SCOPE',
          message: 'Multiple currencies',
          currencies: ['AUD', 'USD'],
        }}
      />,
    );
    expect(screen.getByTestId('invoice-summary-multi-currency-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-summary-indicators')).not.toBeInTheDocument();
    expect(screen.getByText(/AUD, USD/)).toBeInTheDocument();
  });
});
