import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentStatus, RentalTenantConfirmationStatus } from '@properfy/shared';
import { AppointmentDetailSections } from './AppointmentDetailSections';
import type { AppointmentDetail } from '../types';

function makeAppointment(overrides: Partial<AppointmentDetail> = {}): AppointmentDetail {
  return {
    id: 'apt-01',
    appointmentNumber: 1001,
    appointmentCode: 'INS-0042',
    tenantId: 'tenant-1',
    tenantName: 'Test Agency',
    branchId: 'branch-1',
    branchName: 'Downtown Branch',
    propertyId: 'prop-1',
    propertyAddress: '123 Flower Street',
    serviceTypeId: 'svc-1',
    serviceTypeName: 'Move-in Inspection',
    status: AppointmentStatus.DRAFT,
    rentalTenantConfirmationStatus: RentalTenantConfirmationStatus.CONFIRMED,
    contactName: 'John Silva',
    contactPhone: '11999999999',
    contactEmail: 'john@email.com',
    inspectorId: 'insp-1',
    inspectorName: 'Carlos Inspector',
    scheduledDate: '2026-03-25T12:00:00Z',
    timeSlotStart: '09:00', timeSlotEnd: '12:00',
    keyRequired: true,
    notes: 'Test observation',
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    isOverdue: false,
    hasRentalTenantNote: false,
    createdAt: '2026-03-10T10:00:00Z',
    updatedAt: '2026-03-10T10:00:00Z',
    meetingLocation: 'Main entrance',
    keyLocation: 'With the caretaker',
    cancellationReason: null,
    rentalTenantNote: null,
    observation: null,
    hasActivePortalToken: false,
    ...overrides,
  };
}

describe('AppointmentDetailSections', () => {
  it('renders section titles', () => {
    render(<AppointmentDetailSections appointment={makeAppointment()} />);
    expect(screen.getByText('Inspection Details')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('Access')).toBeInTheDocument();
  });

  it('renders service type and property address', () => {
    render(<AppointmentDetailSections appointment={makeAppointment()} />);
    expect(screen.getByText('Move-in Inspection')).toBeInTheDocument();
    expect(screen.getByText('123 Flower Street')).toBeInTheDocument();
  });

  it('renders contact name, phone, email', () => {
    render(<AppointmentDetailSections appointment={makeAppointment()} />);
    expect(screen.getByText('John Silva')).toBeInTheDocument();
    expect(screen.getByText('11999999999')).toBeInTheDocument();
    expect(screen.getByText('john@email.com')).toBeInTheDocument();
  });

  it('shows BooleanIcon for keyRequired', () => {
    render(<AppointmentDetailSections appointment={makeAppointment({ keyRequired: true })} />);
    expect(screen.getByLabelText('Yes')).toBeInTheDocument();
  });

  it('shows tenant confirmation status chip', () => {
    render(<AppointmentDetailSections appointment={makeAppointment()} />);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('shows notes when present', () => {
    render(<AppointmentDetailSections appointment={makeAppointment()} />);
    expect(screen.getByText('Test observation')).toBeInTheDocument();
  });

  it('shows observation section when present, hides when null', () => {
    const { rerender } = render(
      <AppointmentDetailSections appointment={makeAppointment({ observation: null })} />,
    );
    expect(screen.queryByText('Observation')).not.toBeInTheDocument();

    rerender(
      <AppointmentDetailSections
        appointment={makeAppointment({ observation: 'Gate code is 4321' })}
      />,
    );
    // Both the FormSection title and the DetailRow label render "Observation".
    expect(screen.getAllByText('Observation').length).toBeGreaterThan(0);
    expect(screen.getByText('Gate code is 4321')).toBeInTheDocument();
  });

  it('shows em-dash for null inspector', () => {
    render(<AppointmentDetailSections appointment={makeAppointment({ inspectorName: null })} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows cancellation reason when present, hides when null', () => {
    const { rerender } = render(
      <AppointmentDetailSections appointment={makeAppointment({ cancellationReason: null })} />,
    );
    expect(screen.queryByText('Cancellation/Rejection Reason')).not.toBeInTheDocument();

    rerender(
      <AppointmentDetailSections
        appointment={makeAppointment({ cancellationReason: 'Tenant cancelled' })}
      />,
    );
    expect(screen.getByText('Cancellation/Rejection Reason')).toBeInTheDocument();
    expect(screen.getByText('Tenant cancelled')).toBeInTheDocument();
  });

  it('shows pending operator cross-check when DONE has no validator', () => {
    render(
      <AppointmentDetailSections
        appointment={makeAppointment({
          status: AppointmentStatus.DONE,
          doneCheckedByUserId: null,
          doneCheckedAt: null,
        })}
      />,
    );

    expect(screen.getByText('Operational Validation')).toBeInTheDocument();
    expect(screen.getByText('Pending operator cross-check')).toBeInTheDocument();
  });

  it('shows tenant note section when rentalTenantNote is present', () => {
    render(
      <AppointmentDetailSections
        appointment={makeAppointment({ rentalTenantNote: 'I will be late by 10 minutes' })}
      />,
    );

    expect(screen.getByText('Tenant Note')).toBeInTheDocument();
    expect(screen.getByText('I will be late by 10 minutes')).toBeInTheDocument();
  });

  it('does not show tenant note section when rentalTenantNote is null', () => {
    render(
      <AppointmentDetailSections
        appointment={makeAppointment({ rentalTenantNote: null })}
      />,
    );

    expect(screen.queryByText('Tenant Note')).not.toBeInTheDocument();
  });

  it('does not show tenant note section when rentalTenantNote is empty string', () => {
    render(
      <AppointmentDetailSections
        appointment={makeAppointment({ rentalTenantNote: '' })}
      />,
    );

    expect(screen.queryByText('Tenant Note')).not.toBeInTheDocument();
  });

  it('shows validated state when DONE already has cross-check', () => {
    render(
      <AppointmentDetailSections
        appointment={makeAppointment({
          status: AppointmentStatus.DONE,
          doneCheckedByUserId: 'op-1',
          doneCheckedAt: '2026-03-11T11:00:00Z',
        })}
      />,
    );

    expect(screen.getByText('Validated')).toBeInTheDocument();
    expect(screen.getByText(/11\/03\/2026/)).toBeInTheDocument();
  });

  it('renders the Custom Fields section with each label and value when present', () => {
    render(
      <AppointmentDetailSections
        appointment={makeAppointment({
          customFields: [
            { label: 'Gate code', value: '1234' },
            { label: 'Parking', value: 'Level 2' },
          ],
        })}
      />,
    );

    expect(screen.getByText('Custom Fields')).toBeInTheDocument();
    expect(screen.getByText('Gate code')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
    expect(screen.getByText('Parking')).toBeInTheDocument();
    expect(screen.getByText('Level 2')).toBeInTheDocument();
  });

  it('hides the Custom Fields section when there are none', () => {
    render(<AppointmentDetailSections appointment={makeAppointment({ customFields: [] })} />);
    expect(screen.queryByText('Custom Fields')).not.toBeInTheDocument();
  });
});
