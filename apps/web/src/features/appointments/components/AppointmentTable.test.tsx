import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentStatus, TenantConfirmationStatus } from '@properfy/shared';
import { AppointmentTable } from './AppointmentTable';
import type { Appointment } from '../types';

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'apt-1',
    appointmentNumber: 1001,
    code: 'VST-001',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    branchName: 'Downtown Branch',
    propertyId: 'prop-1',
    propertyAddress: '123 Flower Street',
    serviceTypeId: 'svc-1',
    serviceTypeName: 'Move-in Inspection',
    status: AppointmentStatus.SCHEDULED,
    tenantConfirmationStatus: TenantConfirmationStatus.CONFIRMED,
    contactName: 'John Silva',
    contactPhone: '11999999999',
    contactEmail: 'john@email.com',
    inspectorId: 'insp-1',
    inspectorName: 'Carlos Inspector',
    scheduledDate: '2026-03-20',
    timeSlot: '09:00-12:00',
    keyRequired: false,
    notes: null,
    isOverdue: false,
    createdAt: '2026-03-10T10:00:00Z',
    updatedAt: '2026-03-10T10:00:00Z',
    ...overrides,
  };
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
    expect(screen.getAllByText('—')).toHaveLength(2);
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

  it('view action calls onView with correct appointment', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const apt = makeAppointment();
    render(<AppointmentTable data={[apt]} onView={onView} />);
    await user.click(screen.getByLabelText('View'));
    expect(onView).toHaveBeenCalledWith(apt);
  });

  it('edit action calls onEdit with correct appointment', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const apt = makeAppointment({ status: AppointmentStatus.DRAFT });
    render(<AppointmentTable data={[apt]} onEdit={onEdit} />);
    await user.click(screen.getByLabelText('Edit'));
    expect(onEdit).toHaveBeenCalledWith(apt);
  });

  it('hides edit action for non-editable statuses', () => {
    const onEdit = vi.fn();
    const apt = makeAppointment({ status: AppointmentStatus.DONE });
    render(<AppointmentTable data={[apt]} onEdit={onEdit} />);
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
  });
});
