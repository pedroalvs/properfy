import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PricingRuleFilters } from './PricingRuleFilters';
import { DEFAULT_FILTERS } from '../types';

describe('PricingRuleFilters', () => {
  it('renders agency select', () => {
    render(<PricingRuleFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Agency')).toBeInTheDocument();
  });

  it('renders service type select', () => {
    render(<PricingRuleFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Service Type')).toBeInTheDocument();
  });

  it('renders branch select', () => {
    render(<PricingRuleFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Branch')).toBeInTheDocument();
  });

  it('renders status select', () => {
    render(<PricingRuleFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });
});
