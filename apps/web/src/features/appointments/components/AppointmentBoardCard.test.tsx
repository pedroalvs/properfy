import { describe, it, expect } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppointmentStatus, RentalTenantConfirmationStatus } from '@properfy/shared';
import { AppointmentBoardCard } from './AppointmentBoardCard';
import type { Appointment } from '../types';

// The card links to the appointment detail, so every render needs a router context.
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
    timeSlotStart: '09:00',
    timeSlotEnd: '12:00',
    keyRequired: false,
    notes: null,
    isOverdue: false,
    hasRentalTenantNote: false,
    createdAt: '2026-03-10T10:00:00Z',
    updatedAt: '2026-03-10T10:00:00Z',
    ...overrides,
  };
}

describe('AppointmentBoardCard', () => {
  it('shows the tenant note text on hover', async () => {
    const user = userEvent.setup();
    const appointment = makeAppointment({
      hasRentalTenantNote: true,
      rentalTenantNote: 'Dogs in the yard, ring the bell first',
    });
    render(<AppointmentBoardCard appointment={appointment} selected={false} />);

    await user.hover(screen.getByLabelText('Note: Dogs in the yard, ring the bell first'));

    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Note: Dogs in the yard, ring the bell first',
    );
  });

  it('falls back to the generic notice when the note text is missing', () => {
    const appointment = makeAppointment({ hasRentalTenantNote: true });
    render(<AppointmentBoardCard appointment={appointment} selected={false} />);

    expect(screen.getByLabelText('Tenant left a note')).toBeInTheDocument();
  });

  it('does not render the note icon when the appointment has no tenant note', () => {
    render(<AppointmentBoardCard appointment={makeAppointment()} selected={false} />);

    expect(screen.queryByLabelText(/note/i)).not.toBeInTheDocument();
  });
});
