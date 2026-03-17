import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserFilters } from './UserFilters';
import { DEFAULT_FILTERS } from '../types';

describe('UserFilters', () => {
  it('renders all 3 filter controls', () => {
    render(
      <UserFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Role')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('role select shows "All" plus 6 role labels', async () => {
    const user = userEvent.setup();
    render(
      <UserFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Role'));
    const listbox = screen.getByRole('listbox', { name: 'Role' });
    expect(listbox).toHaveTextContent('All');
    expect(screen.getByText('Admin Master')).toBeInTheDocument();
    expect(screen.getByText('Operator')).toBeInTheDocument();
    expect(screen.getByText('Client Admin')).toBeInTheDocument();
    expect(screen.getByText('Client User')).toBeInTheDocument();
    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Tenant')).toBeInTheDocument();
  });

  it('status select shows "All" plus 3 status labels', async () => {
    const user = userEvent.setup();
    render(
      <UserFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    const listbox = screen.getByRole('listbox', { name: 'Status' });
    expect(listbox).toHaveTextContent('All');
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('calls onFiltersChange on role selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <UserFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Role'));
    await user.click(screen.getByText('Operator'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, role: 'OP' });
  });

  it('search input accessible via "Search"', () => {
    render(
      <UserFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Search');
    expect(input.tagName).toBe('INPUT');
  });
});
