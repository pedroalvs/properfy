import { describe, it, expect } from 'vitest';
import { AppointmentStatus, RentalTenantConfirmationStatus, ServiceTypeFlowType } from '@properfy/shared';
import { mapInspectorAppointmentDetail } from '../adapters';
import type { InspectorAppointmentDetailResponse } from '../../types';

function makeResponse(
  overrides: Partial<InspectorAppointmentDetailResponse['data']> = {},
): InspectorAppointmentDetailResponse {
  return {
    data: {
      id: 'apt-1',
      appointmentCode: 'INS-0001',
      status: AppointmentStatus.SCHEDULED,
      scheduledDate: '2026-03-25',
      timeSlotStart: '09:00',
      timeSlotEnd: '11:00',
      propertyAddress: '123 Main St',
      suburb: 'Brunswick',
      rentalTenantConfirmation: RentalTenantConfirmationStatus.CONFIRMED,
      serviceTypeName: 'Routine Inspection',
      flowType: ServiceTypeFlowType.ROUTINE,
      rentalTenantName: 'John Tenant',
      rentalTenantPhone: null,
      rentalTenantEmail: null,
      keyRequired: false,
      meetingLocation: null,
      restrictionsSummary: null,
      propertyLatitude: null,
      propertyLongitude: null,
      notes: null,
      observation: null,
      ...overrides,
    },
  };
}

describe('mapInspectorAppointmentDetail — customFields', () => {
  it('maps custom fields through to the UI model', () => {
    const result = mapInspectorAppointmentDetail(
      makeResponse({
        customFields: [
          { label: 'Gate code', value: '1234' },
          { label: 'Parking', value: 'Level 2' },
        ],
      }),
    );

    expect(result.customFields).toEqual([
      { label: 'Gate code', value: '1234' },
      { label: 'Parking', value: 'Level 2' },
    ]);
  });

  it('defaults to an empty array when custom fields are absent', () => {
    const result = mapInspectorAppointmentDetail(makeResponse());
    expect(result.customFields).toEqual([]);
  });
});
