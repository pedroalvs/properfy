import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OfferFilters } from './OfferFilters';
import { DEFAULT_OFFER_FILTERS } from '../types';

describe('OfferFilters', () => {
  it('renders search filter', () => {
    render(<OfferFilters filters={DEFAULT_OFFER_FILTERS} onFiltersChange={vi.fn()} />);

    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('renders priority filter', () => {
    render(<OfferFilters filters={DEFAULT_OFFER_FILTERS} onFiltersChange={vi.fn()} />);

    expect(screen.getByLabelText('Priority')).toBeInTheDocument();
  });

  it('renders date from and date to filters', () => {
    render(<OfferFilters filters={DEFAULT_OFFER_FILTERS} onFiltersChange={vi.fn()} />);

    expect(screen.getByLabelText('Date From')).toBeInTheDocument();
    expect(screen.getByLabelText('Date To')).toBeInTheDocument();
  });

  it('calls onFiltersChange when priority is changed', () => {
    const onFiltersChange = vi.fn();
    render(<OfferFilters filters={DEFAULT_OFFER_FILTERS} onFiltersChange={onFiltersChange} />);

    // Click the priority dropdown to open it
    fireEvent.click(screen.getByLabelText('Priority'));
    // Select "Standard"
    fireEvent.click(screen.getByText('Standard'));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ priorityMode: 'STANDARD' }),
    );
  });

  it('renders within the offer-filters container', () => {
    render(<OfferFilters filters={DEFAULT_OFFER_FILTERS} onFiltersChange={vi.fn()} />);

    expect(screen.getByTestId('offer-filters')).toBeInTheDocument();
  });
});
