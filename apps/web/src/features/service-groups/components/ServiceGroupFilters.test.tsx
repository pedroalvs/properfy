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
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
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
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
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
    await user.click(screen.getByText('Published'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, status: 'PUBLISHED' });
  });

  it('search input accessible via "Search"', () => {
    render(
      <ServiceGroupFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Search');
    expect(input.tagName).toBe('INPUT');
  });
});
