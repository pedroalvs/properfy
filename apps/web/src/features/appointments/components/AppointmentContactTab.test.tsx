import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentContactTab } from './AppointmentContactTab';
import type { AppointmentDetail } from '../types';

const MOCK_APPOINTMENT: AppointmentDetail = {
  id: 'apt-01',
  appointmentNumber: 1001,
  code: 'VST-001',
  tenantId: 'tenant-1',
  tenantName: 'Test Agency',
  branchId: 'branch-1',
  branchName: 'Downtown Branch',
  propertyId: 'prop-1',
  propertyAddress: '123 Flower Street',
  serviceTypeId: 'st-1',
  serviceTypeName: 'Inspection',
  status: 'SCHEDULED' as any,
  rentalTenantConfirmationStatus: 'PENDING' as any,
  contactName: 'John Doe',
  contactPhone: '+5511999000000',
  contactEmail: 'john@example.com',
  inspectorId: null,
  inspectorName: null,
  scheduledDate: '2026-04-01',
  timeSlot: '09:00-12:00',
  keyRequired: true,
  notes: null,
  isOverdue: false,
  createdAt: '2026-03-01T10:00:00Z',
  updatedAt: '2026-03-01T10:00:00Z',
  meetingLocation: 'Front entrance',
  keyLocation: 'Reception desk',
  cancellationReason: null,
  hasRentalTenantNote: false,
  rentalTenantNote: null,
  observation: null,
  hasActivePortalToken: false,
  restrictions: [
    {
      id: 'res-1',
      isHome: true,
      unavailableDaysJson: null,
      unavailableHoursJson: null,
      notes: 'Ring the bell',
      source: 'OPERATOR',
    },
  ],
};

const MOCK_WITH_CONTACTS: AppointmentDetail = {
  ...MOCK_APPOINTMENT,
  contacts: [
    {
      id: 'ac-1',
      contactId: null,
      role: 'RENTAL_TENANT' as any,
      isPrimary: true,
      snapshotName: 'John Doe',
      snapshotEmail: 'john@example.com',
      snapshotPhone: '+5511999000000',
    },
    {
      id: 'ac-2',
      contactId: null,
      role: 'HOUSEKEEPER' as any,
      isPrimary: false,
      snapshotName: 'Maria Silva',
      snapshotEmail: 'maria@example.com',
      snapshotPhone: '+5511888000000',
    },
  ],
};

describe('AppointmentContactTab', () => {
  it('renders contact information from legacy single contact fields', () => {
    render(<AppointmentContactTab appointment={MOCK_APPOINTMENT} />);
    expect(screen.getByText('Contact Information')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('+5511999000000')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('Tenant')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
  });

  it('renders multiple contacts from contacts array', () => {
    render(<AppointmentContactTab appointment={MOCK_WITH_CONTACTS} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('Tenant')).toBeInTheDocument();
    expect(screen.getByText('Housekeeper')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('maria@example.com')).toBeInTheDocument();
  });

  it('renders access restrictions section', () => {
    render(<AppointmentContactTab appointment={MOCK_APPOINTMENT} />);
    expect(screen.getByText('Access Restrictions')).toBeInTheDocument();
    expect(screen.getByText('Front entrance')).toBeInTheDocument();
    expect(screen.getByText('Reception desk')).toBeInTheDocument();
    expect(screen.getByText('Ring the bell')).toBeInTheDocument();
  });

  it('shows dash for null contact values in legacy mode', () => {
    const apt: AppointmentDetail = {
      ...MOCK_APPOINTMENT,
      contactPhone: null,
      contactEmail: null,
      meetingLocation: null,
      keyLocation: null,
    };
    render(<AppointmentContactTab appointment={apt} />);
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });

  it('shows dash for null snapshot values in contacts array mode', () => {
    const apt: AppointmentDetail = {
      ...MOCK_APPOINTMENT,
      contacts: [
        {
          id: 'ac-1',
          contactId: null,
          role: 'RENTAL_TENANT' as any,
          isPrimary: true,
          snapshotName: 'Jane',
          snapshotEmail: null,
          snapshotPhone: null,
        },
      ],
    };
    render(<AppointmentContactTab appointment={apt} />);
    expect(screen.getByText('Jane')).toBeInTheDocument();
    const dashes = screen.getAllByText('\u2014');
    // At least 2 dashes for null email and phone in the contact row,
    // plus more from the access restrictions section
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
