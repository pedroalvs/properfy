import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvoiceFilters } from './InvoiceFilters';
import { DEFAULT_INVOICE_FILTERS } from '../types';

describe('InvoiceFilters', () => {
  const onFiltersChange = vi.fn();

  it('renders inspector, status, and period filter controls', () => {
    render(
      <InvoiceFilters
        filters={DEFAULT_INVOICE_FILTERS}
        onFiltersChange={onFiltersChange}
        inspectorOptions={[{ label: 'Diego', value: 'insp-1' }]}
      />,
    );

    expect(screen.getByLabelText('Inspector')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Period - start')).toBeInTheDocument();
    expect(screen.getByLabelText('Period - end')).toBeInTheDocument();
  });

  it('calls onFiltersChange when inspector changes', async () => {
    const user = userEvent.setup();
    render(
      <InvoiceFilters
        filters={DEFAULT_INVOICE_FILTERS}
        onFiltersChange={onFiltersChange}
        inspectorOptions={[{ label: 'Diego', value: 'insp-1' }]}
      />,
    );

    await user.click(screen.getByLabelText('Inspector'));
    await user.click(screen.getByText('Diego'));

    expect(onFiltersChange).toHaveBeenCalledWith({ ...DEFAULT_INVOICE_FILTERS, inspectorId: 'insp-1' });
  });
});
