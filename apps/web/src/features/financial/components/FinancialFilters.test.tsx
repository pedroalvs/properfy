import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FinancialFilters } from './FinancialFilters';
import { DEFAULT_FILTERS } from '../types';

describe('FinancialFilters', () => {
  it('renders type and status filter controls', () => {
    render(
      <FinancialFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('type select ("Type") shows "All" plus 4 type labels', async () => {
    const user = userEvent.setup();
    render(
      <FinancialFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Type'));
    const listbox = screen.getByRole('listbox', { name: 'Type' });
    expect(listbox).toHaveTextContent('All');
    expect(screen.getByText('Tenant Debit')).toBeInTheDocument();
    expect(screen.getByText('Inspector Payout')).toBeInTheDocument();
    expect(screen.getByText('Refund')).toBeInTheDocument();
    expect(screen.getByText('Manual Adjustment')).toBeInTheDocument();
  });

  it('status select shows "All" plus 3 status labels', async () => {
    const user = userEvent.setup();
    render(
      <FinancialFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    const listbox = screen.getByRole('listbox', { name: 'Status' });
    expect(listbox).toHaveTextContent('All');
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('calls onFiltersChange on type selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FinancialFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Type'));
    await user.click(screen.getByText('Refund'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, entryType: 'REFUND' });
  });
});
