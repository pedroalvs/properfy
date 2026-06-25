import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceTypeFilters } from './ServiceTypeFilters';
import { DEFAULT_FILTERS } from '../types';

describe('ServiceTypeFilters', () => {
  it('renders search input', () => {
    render(<ServiceTypeFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('renders status select', () => {
    render(<ServiceTypeFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });
});
