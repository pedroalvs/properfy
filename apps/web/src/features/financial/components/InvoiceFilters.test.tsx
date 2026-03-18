import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InvoiceFilters } from './InvoiceFilters';
import { DEFAULT_INVOICE_FILTERS } from '../types';

describe('InvoiceFilters', () => {
  const onFiltersChange = vi.fn();

  it('renders search, status, and period filter controls', () => {
    render(
      <InvoiceFilters filters={DEFAULT_INVOICE_FILTERS} onFiltersChange={onFiltersChange} />,
    );

    expect(screen.getByLabelText('Inspector')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Period - start')).toBeInTheDocument();
    expect(screen.getByLabelText('Period - end')).toBeInTheDocument();
  });

  it('calls onFiltersChange when search input changes', async () => {
    vi.useFakeTimers();
    render(
      <InvoiceFilters filters={DEFAULT_INVOICE_FILTERS} onFiltersChange={onFiltersChange} />,
    );

    fireEvent.change(screen.getByLabelText('Inspector'), { target: { value: 'Diego' } });

    vi.advanceTimersByTime(300);

    expect(onFiltersChange).toHaveBeenCalledWith({ ...DEFAULT_INVOICE_FILTERS, search: 'Diego' });
    vi.useRealTimers();
  });
});
