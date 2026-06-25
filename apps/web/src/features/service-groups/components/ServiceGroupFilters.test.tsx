import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServiceGroupFilters } from './ServiceGroupFilters';
import { DEFAULT_FILTERS } from '../types';

describe('ServiceGroupFilters', () => {
  it('renders both filter controls', () => {
    render(
      <ServiceGroupFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('status select shows "All" plus 4 status labels', async () => {
    const user = userEvent.setup();
    render(
      <ServiceGroupFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    const listbox = screen.getByRole('listbox', { name: 'Status' });
    expect(listbox).toHaveTextContent('All');
    expect(screen.getByText('Awaiting Host')).toBeInTheDocument();
    expect(screen.getByText('Awaiting Inspector')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Canceled')).toBeInTheDocument();
  });

  it('calls onFiltersChange on status selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ServiceGroupFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    await user.click(screen.getByText('Awaiting Inspector'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, status: 'PUBLISHED' });
  });

  it('does not render unsupported search filter', () => {
    render(
      <ServiceGroupFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument();
  });
});
