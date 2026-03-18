import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentContactTab } from './AppointmentContactTab';
import type { AppointmentDetail } from '../types';

const MOCK_APPOINTMENT: AppointmentDetail = {
  id: 'apt-01',
  code: 'VST-001',
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  branchName: 'Downtown Branch',
  propertyId: 'prop-1',
  propertyAddress: '123 Flower Street',
  serviceTypeId: 'st-1',
  serviceTypeName: 'Inspection',
  status: 'SCHEDULED' as any,
  tenantConfirmationStatus: 'PENDING' as any,
  contactName: 'John Doe',
  contactPhone: '+5511999000000',
  contactEmail: 'john@example.com',
  inspectorId: null,
  inspectorName: null,
  scheduledDate: '2026-04-01',
  timeSlot: '09:00-12:00',
  keyRequired: true,
  notes: null,
  createdAt: '2026-03-01T10:00:00Z',
  updatedAt: '2026-03-01T10:00:00Z',
  meetingLocation: 'Front entrance',
  keyLocation: 'Reception desk',
  cancellationReason: null,
};

describe('AppointmentContactTab', () => {
  it('renders contact information section', () => {
    render(<AppointmentContactTab appointment={MOCK_APPOINTMENT} />);
    expect(screen.getByText('Contact Information')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('+5511999000000')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
  });

  it('renders access restrictions section', () => {
    render(<AppointmentContactTab appointment={MOCK_APPOINTMENT} />);
    expect(screen.getByText('Access Restrictions')).toBeInTheDocument();
    expect(screen.getByText('Front entrance')).toBeInTheDocument();
    expect(screen.getByText('Reception desk')).toBeInTheDocument();
  });

  it('shows dash for null values', () => {
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
});
