import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantFilters } from './TenantFilters';
import { DEFAULT_FILTERS } from '../types';

describe('TenantFilters', () => {
  it('renders both filter controls', () => {
    render(
      <TenantFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmation Status')).toBeInTheDocument();
  });

  it('status select shows "All" plus 4 status labels', async () => {
    const user = userEvent.setup();
    render(
      <TenantFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Confirmation Status'));
    const listbox = screen.getByRole('listbox', { name: 'Confirmation Status' });
    expect(listbox).toHaveTextContent('All');
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('No Response')).toBeInTheDocument();
  });

  it('calls onFiltersChange on status selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TenantFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Confirmation Status'));
    await user.click(screen.getByText('Confirmed'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, confirmationStatus: 'CONFIRMED' });
  });

  it('search input accessible via "Search"', () => {
    render(
      <TenantFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Search');
    expect(input.tagName).toBe('INPUT');
  });
});
