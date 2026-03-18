import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlotFilters } from './SlotFilters';
import { DEFAULT_SLOT_FILTERS } from '../types';

describe('SlotFilters', () => {
  const onFiltersChange = vi.fn();

  it('renders search input', () => {
    render(
      <SlotFilters filters={DEFAULT_SLOT_FILTERS} onFiltersChange={onFiltersChange} />,
    );
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

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

  it('calls onFiltersChange when search input changes', () => {
    vi.useFakeTimers();
    render(
      <SlotFilters filters={DEFAULT_SLOT_FILTERS} onFiltersChange={onFiltersChange} />,
    );

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Diego' } });
    vi.advanceTimersByTime(300);

    expect(onFiltersChange).toHaveBeenCalledWith({ ...DEFAULT_SLOT_FILTERS, search: 'Diego' });
    vi.useRealTimers();
  });
});
