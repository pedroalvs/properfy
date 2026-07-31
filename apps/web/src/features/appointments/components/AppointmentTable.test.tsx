import { describe, it, expect } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppointmentStatus, RentalTenantConfirmationStatus } from '@properfy/shared';
import { AppointmentTable } from './AppointmentTable';
import type { Appointment } from '../types';

// The View action renders a router <Link>, so every render needs a router context.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'apt-1',
    appointmentNumber: 1001,
    code: 'VST-001',
    tenantId: 'tenant-1',
    clientName: 'Test Agency',
    branchId: 'branch-1',
    branchName: 'Downtown Branch',
    propertyId: 'prop-1',
    propertyAddress: '123 Flower Street',
    serviceTypeId: 'svc-1',
    serviceTypeName: 'Move-in Inspection',
    status: AppointmentStatus.SCHEDULED,
    rentalTenantConfirmationStatus: RentalTenantConfirmationStatus.CONFIRMED,
    contactName: 'John Silva',
    contactPhone: '11999999999',
    contactEmail: 'john@email.com',
    inspectorId: 'insp-1',
    inspectorName: 'Carlos Inspector',
    scheduledDate: '2026-03-20',
    timeSlotStart: '09:00', timeSlotEnd: '12:00',
    keyRequired: false,
    notes: null,
    isOverdue: false,
    hasRentalTenantNote: false,
    createdAt: '2026-03-10T10:00:00Z',
    updatedAt: '2026-03-10T10:00:00Z',
    ...overrides,
  };
}

/**
 * Reads one body cell by its column header. The Group and Reviewed columns
 * already render em dashes for most fixtures, so a bare `getAllByText('—')`
 * would pass without the column under test ever falling back.
 */
function cellUnder(header: string): HTMLElement {
  const headers = [...document.querySelectorAll('table thead th')];
  const index = headers.findIndex((th) => th.textContent?.trim() === header);
  if (index === -1) throw new Error(`No "${header}" column is rendered`);
  const cell = document.querySelector('table tbody tr')?.children[index];
  if (!cell) throw new Error(`No body cell under "${header}"`);
  return cell as HTMLElement;
}

describe('AppointmentTable', () => {
  it('renders column headers', () => {
    render(<AppointmentTable data={[]} />);
    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByText('Tenant')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Confirmation')).toBeInTheDocument();
    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Scheduled Date')).toBeInTheDocument();
    expect(screen.getByText('Reviewed')).toBeInTheDocument();
    expect(screen.getByText('Group')).toBeInTheDocument();
    expect(screen.getByText('Branch')).toBeInTheDocument();
  });

  describe('Agency column', () => {
    // Agency is AM/OP-only: a client user is pinned to a single agency, so the
    // column would repeat their own name on every row.
    it('is hidden by default', () => {
      render(<AppointmentTable data={[makeAppointment()]} />);
      expect(screen.queryByText('Agency')).not.toBeInTheDocument();
      expect(screen.queryByText('Test Agency')).not.toBeInTheDocument();
    });

    it('renders the agency name when showAgency is set', () => {
      render(<AppointmentTable data={[makeAppointment()]} showAgency />);
      expect(screen.getByText('Agency')).toBeInTheDocument();
      expect(cellUnder('Agency')).toHaveTextContent('Test Agency');
    });

    // The backend maps an absent relation to '' (`row.tenant?.name ?? ''`) and the
    // response schema marks the field optional, so both empty and undefined reach
    // the client. Neither may render as blank or "undefined".
    it.each([
      ['undefined', undefined],
      ['empty', ''],
    ])('renders an em dash when the agency name is %s', (_label, clientName) => {
      render(<AppointmentTable data={[makeAppointment({ clientName })]} showAgency />);
      expect(cellUnder('Agency')).toHaveTextContent('—');
    });
  });

  describe('Branch column', () => {
    it('renders the branch name for every role', () => {
      render(<AppointmentTable data={[makeAppointment()]} />);
      expect(cellUnder('Branch')).toHaveTextContent('Downtown Branch');
    });

    it('renders an em dash when the branch name is empty', () => {
      render(<AppointmentTable data={[makeAppointment({ branchName: '' })]} />);
      expect(cellUnder('Branch')).toHaveTextContent('—');
    });
  });

  it('renders service group code when grouped and em-dash when ungrouped', () => {
    const grouped = makeAppointment({ id: 'apt-g', serviceGroupCode: '12' });
    const ungrouped = makeAppointment({ id: 'apt-u', serviceGroupCode: null });
    render(<AppointmentTable data={[grouped, ungrouped]} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders appointment data in rows', () => {
    const apt = makeAppointment();
    render(<AppointmentTable data={[apt]} />);
    expect(screen.getByText('VST-001')).toBeInTheDocument();
    expect(screen.getByText('123 Flower Street')).toBeInTheDocument();
    expect(screen.getByText('John Silva')).toBeInTheDocument();
    expect(screen.getByText('Carlos Inspector')).toBeInTheDocument();
  });

  it('renders AppointmentStatusChip for status column', () => {
    const apt = makeAppointment({ status: AppointmentStatus.DONE });
    render(<AppointmentTable data={[apt]} />);
    expect(screen.getByText('Done (Review Required)')).toBeInTheDocument();
  });

  it('shows reviewed false for DONE without operator cross-check', () => {
    const apt = makeAppointment({
      status: AppointmentStatus.DONE,
      doneCheckedByUserId: null,
      doneCheckedAt: null,
    });
    render(<AppointmentTable data={[apt]} />);
    expect(screen.getByLabelText('No')).toBeInTheDocument();
  });

  it('shows reviewed true for DONE with operator cross-check', () => {
    const apt = makeAppointment({
      status: AppointmentStatus.DONE,
      doneCheckedByUserId: 'op-1',
      doneCheckedAt: '2026-03-24T12:00:00Z',
    });
    render(<AppointmentTable data={[apt]} />);
    expect(screen.getByLabelText('Yes')).toBeInTheDocument();
  });

  it('renders em dash for null inspectorName', () => {
    const apt = makeAppointment({ inspectorId: null, inspectorName: null });
    render(<AppointmentTable data={[apt]} />);
    // Inspector, Reviewed, and Group columns each render an em-dash for this row
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('formats scheduled date', () => {
    const apt = makeAppointment({ scheduledDate: '2026-03-20T12:00:00Z' });
    render(<AppointmentTable data={[apt]} />);
    expect(screen.getByText('20/03/2026')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<AppointmentTable data={[]} loading />);
    expect(screen.queryByText('Code')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<AppointmentTable data={[]} />);
    expect(screen.getByText('No records found')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<AppointmentTable data={[]} error="Network error" />);
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows tenant note icon for REJECTED appointment with hasRentalTenantNote', () => {
    const apt = makeAppointment({
      status: AppointmentStatus.REJECTED,
      hasRentalTenantNote: true,
    });
    render(<AppointmentTable data={[apt]} />);
    expect(screen.getByLabelText('Tenant left a note')).toBeInTheDocument();
  });

  it('shows tenant note icon for SCHEDULED appointment with hasRentalTenantNote (GROUP_JOIN stores notes)', () => {
    const apt = makeAppointment({
      status: AppointmentStatus.SCHEDULED,
      hasRentalTenantNote: true,
    });
    render(<AppointmentTable data={[apt]} />);
    expect(screen.getByLabelText('Tenant left a note')).toBeInTheDocument();
  });

  it('does not show tenant note icon for REJECTED appointment without hasRentalTenantNote', () => {
    const apt = makeAppointment({
      status: AppointmentStatus.REJECTED,
      hasRentalTenantNote: false,
    });
    render(<AppointmentTable data={[apt]} />);
    expect(screen.queryByLabelText('Tenant left a note')).not.toBeInTheDocument();
  });

  it('view action links to the appointment detail in the same tab', () => {
    const apt = makeAppointment();
    render(<AppointmentTable data={[apt]} />);
    const link = screen.getByLabelText('View');
    expect(link).toHaveAttribute('href', '/appointments/apt-1');
    expect(link).not.toHaveAttribute('target');
  });

});
