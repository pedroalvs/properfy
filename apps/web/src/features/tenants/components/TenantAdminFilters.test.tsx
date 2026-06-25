import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TenantAdminFilters } from './TenantAdminFilters';
import { DEFAULT_TENANT_ADMIN_FILTERS } from '../types';

describe('TenantAdminFilters', () => {
  it('renders search input', () => {
    render(
      <TenantAdminFilters
        filters={DEFAULT_TENANT_ADMIN_FILTERS}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('renders status select', () => {
    render(
      <TenantAdminFilters
        filters={DEFAULT_TENANT_ADMIN_FILTERS}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('calls onFiltersChange when search value changes', async () => {
    vi.useFakeTimers();
    const onFiltersChange = vi.fn();
    render(
      <TenantAdminFilters
        filters={DEFAULT_TENANT_ADMIN_FILTERS}
        onFiltersChange={onFiltersChange}
      />,
    );

    const searchInput = screen.getByLabelText('Search');
    fireEvent.change(searchInput, { target: { value: 'A' } });

    vi.advanceTimersByTime(300);

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'A' }),
    );
    vi.useRealTimers();
  });

  it('displays current search value', () => {
    render(
      <TenantAdminFilters
        filters={{ search: 'Alpha', status: '' }}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Alpha')).toBeInTheDocument();
  });
});
