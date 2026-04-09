import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentFilters } from './AppointmentFilters';
import { DEFAULT_FILTERS } from '../types';
import type { FilterSelectOption } from '@/components/filters/FilterSelect';

const branchOptions: FilterSelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Downtown Branch', value: 'branch-1' },
];

describe('AppointmentFilters', () => {
  it('renders all filter controls', () => {
    render(
      <AppointmentFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
        branchOptions={branchOptions}
        serviceTypeOptions={[]}
      />,
    );
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmation')).toBeInTheDocument();
    expect(screen.getByLabelText('Branch')).toBeInTheDocument();
    expect(screen.getByLabelText('Period - start')).toBeInTheDocument();
    expect(screen.getByLabelText('Period - end')).toBeInTheDocument();
    expect(screen.getByLabelText('Show cancelled')).toBeInTheDocument();
  });

  it('renders search input accessible via label "Search"', () => {
    render(
      <AppointmentFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
        branchOptions={branchOptions}
        serviceTypeOptions={[]}
      />,
    );
    const input = screen.getByLabelText('Search');
    expect(input.tagName).toBe('INPUT');
  });

  it('renders status select with all 6 status labels plus "All"', async () => {
    const user = userEvent.setup();
    render(
      <AppointmentFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
        branchOptions={branchOptions}
        serviceTypeOptions={[]}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    const listbox = screen.getByRole('listbox', { name: 'Status' });
    expect(listbox).toHaveTextContent('All');
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Awaiting Inspector')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('renders "Show cancelled" boolean toggle', () => {
    render(
      <AppointmentFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
        branchOptions={branchOptions}
        serviceTypeOptions={[]}
      />,
    );
    const checkbox = screen.getByLabelText('Show cancelled');
    expect(checkbox).not.toBeChecked();
  });

  it('calls onFiltersChange when boolean toggle is changed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AppointmentFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
        branchOptions={branchOptions}
        serviceTypeOptions={[]}
      />,
    );
    await user.click(screen.getByLabelText('Show cancelled'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, showCancelled: true });
  });

  it('calls onFiltersChange when status is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AppointmentFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
        branchOptions={branchOptions}
        serviceTypeOptions={[]}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    await user.click(screen.getByText('Scheduled'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, status: 'SCHEDULED' });
  });

  it('calls onFiltersChange when tenant response is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AppointmentFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
        branchOptions={branchOptions}
        serviceTypeOptions={[]}
      />,
    );

    await user.click(screen.getByLabelText('Confirmation'));
    await user.click(screen.getByText('No Response'));

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      tenantConfirmationStatus: 'NO_RESPONSE',
    });
  });
});
