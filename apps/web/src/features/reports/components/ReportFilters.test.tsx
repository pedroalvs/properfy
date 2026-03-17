import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportFilters } from './ReportFilters';
import { DEFAULT_FILTERS } from '../types';

describe('ReportFilters', () => {
  it('renders both filter controls', () => {
    render(
      <ReportFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('type select shows "All" plus 7 type labels', async () => {
    const user = userEvent.setup();
    render(
      <ReportFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Type'));
    const listbox = screen.getByRole('listbox', { name: 'Type' });
    expect(listbox).toHaveTextContent('All');
    expect(screen.getByText('Scheduled Inspections')).toBeInTheDocument();
    expect(screen.getByText('Completed Inspections')).toBeInTheDocument();
    expect(screen.getByText('Cancelled Inspections')).toBeInTheDocument();
    expect(screen.getByText('Rejected Inspections')).toBeInTheDocument();
    expect(screen.getByText('Inspector Performance')).toBeInTheDocument();
    expect(screen.getByText('Confirmation Status')).toBeInTheDocument();
    expect(screen.getByText('Financial Services')).toBeInTheDocument();
  });

  it('status select shows "All" plus 4 status labels', async () => {
    const user = userEvent.setup();
    render(
      <ReportFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    const listbox = screen.getByRole('listbox', { name: 'Status' });
    expect(listbox).toHaveTextContent('All');
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('calls onFiltersChange on type selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ReportFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Type'));
    await user.click(screen.getByText('Scheduled Inspections'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, reportType: 'INSPECTIONS_SCHEDULED' });
  });
});
