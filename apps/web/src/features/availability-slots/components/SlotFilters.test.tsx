import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlotFilters } from './SlotFilters';
import { DEFAULT_SLOT_FILTERS } from '../types';

describe('SlotFilters', () => {
  const onFiltersChange = vi.fn();

  it('renders status filter', () => {
    render(
      <SlotFilters filters={DEFAULT_SLOT_FILTERS} onFiltersChange={onFiltersChange} />,
    );
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders date range filter', () => {
    render(
      <SlotFilters filters={DEFAULT_SLOT_FILTERS} onFiltersChange={onFiltersChange} />,
    );
    expect(screen.getByLabelText('Date - start')).toBeInTheDocument();
    expect(screen.getByLabelText('Date - end')).toBeInTheDocument();
  });

  it('does not render unsupported search filter', () => {
    render(
      <SlotFilters filters={DEFAULT_SLOT_FILTERS} onFiltersChange={onFiltersChange} />,
    );
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument();
  });
});
