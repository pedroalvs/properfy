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

const suburbOptions: FilterSelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Bondi', value: 'Bondi' },
];

describe('AppointmentFilters', () => {
  it('renders all filter controls', () => {
    render(
      <AppointmentFilters
        filters={DEFAULT_FILTERS}
        onFiltersChange={() => {}}
        branchOptions={branchOptions}
        serviceTypeOptions={[]}
        suburbOptions={suburbOptions}
      />,
    );
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Tenant Confirmation')).toBeInTheDocument();
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
        suburbOptions={suburbOptions}
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
        suburbOptions={suburbOptions}
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
        suburbOptions={suburbOptions}
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
        suburbOptions={suburbOptions}
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
        suburbOptions={suburbOptions}
      />,
    );
    await user.click(screen.getByLabelText('Status'));
    await user.click(screen.getByText('Scheduled'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, status: 'SCHEDULED' });
  });

  describe('hiddenFilters', () => {
    function renderWithHidden(hiddenFilters: ReadonlyArray<'status' | 'showCancelled'>) {
      render(
        <AppointmentFilters
          filters={DEFAULT_FILTERS}
          onFiltersChange={() => {}}
          branchOptions={branchOptions}
          serviceTypeOptions={[]}
          suburbOptions={suburbOptions}
          hiddenFilters={hiddenFilters}
        />,
      );
    }

    it('omits both controls the board opts out of', () => {
      // Status is the board's column axis, and cancelled rows always show in
      // the Cancelled column — either control would contradict what is on screen.
      renderWithHidden(['status', 'showCancelled']);

      expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Show cancelled')).not.toBeInTheDocument();
    });

    it('keeps every other control when some are hidden', () => {
      renderWithHidden(['status', 'showCancelled']);

      expect(screen.getByLabelText('Search')).toBeInTheDocument();
      expect(screen.getByLabelText('Branch')).toBeInTheDocument();
      expect(screen.getByLabelText('Tenant Confirmation')).toBeInTheDocument();
      expect(screen.getByLabelText('Period - start')).toBeInTheDocument();
      expect(screen.getByLabelText('Period - end')).toBeInTheDocument();
      expect(screen.getByLabelText('Overdue only')).toBeInTheDocument();
    });

    it('hides one control without hiding the other', () => {
      renderWithHidden(['status']);

      expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Show cancelled')).toBeInTheDocument();
    });
  });

  describe('Agency and Inspector selects', () => {
    const agencyOptions: FilterSelectOption[] = [{ label: 'Acme Realty', value: 'tenant-1' }];
    const inspectorOptions: FilterSelectOption[] = [{ label: 'Carlos Inspector', value: 'insp-1' }];

    // Both controls are opt-in by options, not by an internal role check: the
    // pages own the RBAC (only AM/OP may call /v1/tenants) and pass empty
    // arrays when a control must not appear.
    it('omits both when no options are supplied', () => {
      render(
        <AppointmentFilters
          filters={DEFAULT_FILTERS}
          onFiltersChange={() => {}}
          branchOptions={branchOptions}
          serviceTypeOptions={[]}
          suburbOptions={suburbOptions}
        />,
      );
      expect(screen.queryByLabelText('Agency')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Inspector')).not.toBeInTheDocument();
    });

    it('renders each one independently of the other', () => {
      render(
        <AppointmentFilters
          filters={DEFAULT_FILTERS}
          onFiltersChange={() => {}}
          branchOptions={branchOptions}
          serviceTypeOptions={[]}
          suburbOptions={suburbOptions}
          inspectorOptions={inspectorOptions}
        />,
      );
      // A client user gets Inspector but never Agency.
      expect(screen.queryByLabelText('Agency')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Inspector')).toBeInTheDocument();
    });

    it('clears the selected branch when the agency changes', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <AppointmentFilters
          filters={{ ...DEFAULT_FILTERS, branchId: 'branch-1' }}
          onFiltersChange={onChange}
          branchOptions={branchOptions}
          serviceTypeOptions={[]}
          suburbOptions={suburbOptions}
          agencyOptions={agencyOptions}
        />,
      );

      await user.click(screen.getByLabelText('Agency'));
      await user.click(screen.getByText('Acme Realty'));

      // Branch options cascade from the agency, so a branch of the previous
      // agency would silently filter everything out.
      expect(onChange).toHaveBeenCalledWith({
        ...DEFAULT_FILTERS,
        tenantId: 'tenant-1',
        branchId: '',
      });
    });

    it('calls onFiltersChange when an inspector is selected', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <AppointmentFilters
          filters={DEFAULT_FILTERS}
          onFiltersChange={onChange}
          branchOptions={branchOptions}
          serviceTypeOptions={[]}
          suburbOptions={suburbOptions}
          inspectorOptions={inspectorOptions}
        />,
      );

      await user.click(screen.getByLabelText('Inspector'));
      await user.click(screen.getByText('Carlos Inspector'));

      expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, inspectorId: 'insp-1' });
    });
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
        suburbOptions={suburbOptions}
      />,
    );

    await user.click(screen.getByLabelText('Tenant Confirmation'));
    await user.click(screen.getByText('No Response'));

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      rentalTenantConfirmationStatus: 'NO_RESPONSE',
    });
  });

  describe('suburb filter', () => {
    it('renders the suburb options it is given', async () => {
      const user = userEvent.setup();
      render(
        <AppointmentFilters
          filters={DEFAULT_FILTERS}
          onFiltersChange={() => {}}
          branchOptions={branchOptions}
          serviceTypeOptions={[]}
          suburbOptions={suburbOptions}
        />,
      );

      await user.click(screen.getByLabelText('Suburb'));
      expect(screen.getByRole('listbox', { name: 'Suburb' })).toHaveTextContent('Bondi');
    });

    it('calls onFiltersChange when a suburb is selected', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <AppointmentFilters
          filters={DEFAULT_FILTERS}
          onFiltersChange={onChange}
          branchOptions={branchOptions}
          serviceTypeOptions={[]}
          suburbOptions={suburbOptions}
        />,
      );

      await user.click(screen.getByLabelText('Suburb'));
      await user.click(screen.getByText('Bondi'));

      expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, suburb: 'Bondi' });
    });
  });

  describe('confirmation email filter', () => {
    // The two confirmation controls mean different things — the tenant's answer
    // vs whether the notice email went out — so both labels must be distinct
    // and reachable side by side.
    it('renders separately from the tenant confirmation filter', () => {
      render(
        <AppointmentFilters
          filters={DEFAULT_FILTERS}
          onFiltersChange={() => {}}
          branchOptions={branchOptions}
          serviceTypeOptions={[]}
          suburbOptions={suburbOptions}
        />,
      );

      expect(screen.getByLabelText('Tenant Confirmation')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirmation Email')).toBeInTheDocument();
    });

    it('calls onFiltersChange with the sent/not_sent wire value', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <AppointmentFilters
          filters={DEFAULT_FILTERS}
          onFiltersChange={onChange}
          branchOptions={branchOptions}
          serviceTypeOptions={[]}
          suburbOptions={suburbOptions}
        />,
      );

      await user.click(screen.getByLabelText('Confirmation Email'));
      await user.click(screen.getByText('Not sent'));

      expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, confirmationStatus: 'not_sent' });
    });
  });
});
