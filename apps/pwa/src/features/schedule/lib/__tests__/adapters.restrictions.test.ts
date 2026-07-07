import { describe, it, expect } from 'vitest';
import { mapInspectorAppointmentDetail } from '../adapters';
import type { InspectorAppointmentDetailResponse } from '../../types';
import { AppointmentStatus } from '@properfy/shared';

function makeResponse(
  overrides: Partial<InspectorAppointmentDetailResponse['data']> = {},
): InspectorAppointmentDetailResponse {
  return {
    data: {
      id: 'appt-1',
      appointmentCode: 'INS-0001',
      status: AppointmentStatus.SCHEDULED,
      scheduledDate: '2026-07-10',
      timeSlotStart: '09:00',
      timeSlotEnd: '11:00',
      propertyAddress: '42 Wallaby Way',
      suburb: 'Sydney',
      rentalTenantConfirmation: 'CONFIRMED',
      serviceTypeName: 'Routine Inspection',
      flowType: 'ROUTINE',
      rentalTenantName: 'John Smith',
      rentalTenantPhone: null,
      rentalTenantEmail: null,
      keyRequired: false,
      meetingLocation: null,
      restrictionsSummary: 'Dog in backyard',
      propertyLatitude: null,
      propertyLongitude: null,
      notes: null,
      observation: null,
      ...overrides,
    } as InspectorAppointmentDetailResponse['data'],
  };
}

describe('mapInspectorAppointmentDetail — structured restrictions', () => {
  it('maps structured restrictions with parsed days/hours arrays', () => {
    const result = mapInspectorAppointmentDetail(makeResponse({
      restrictions: [
        {
          isHome: true,
          unavailableDaysJson: ['Monday', 'Tuesday'],
          unavailableHoursJson: ['08:00-09:00'],
          notes: 'Dog in backyard',
        },
      ],
    }));

    expect(result.restrictionDetails).toEqual([
      {
        isHome: true,
        unavailableDays: ['Monday', 'Tuesday'],
        unavailableHours: ['08:00-09:00'],
        notes: 'Dog in backyard',
      },
    ]);
  });

  it('defensively drops non-string entries and non-array JSON', () => {
    const result = mapInspectorAppointmentDetail(makeResponse({
      restrictions: [
        {
          isHome: false,
          unavailableDaysJson: ['Monday', 42, null],
          unavailableHoursJson: { bogus: true },
          notes: null,
        },
      ],
    }));

    expect(result.restrictionDetails).toEqual([
      { isHome: false, unavailableDays: ['Monday'], unavailableHours: [], notes: null },
    ]);
  });

  it('returns an empty array when restrictions are absent', () => {
    const result = mapInspectorAppointmentDetail(makeResponse());
    expect(result.restrictionDetails).toEqual([]);
    expect(result.restrictions).toBe('Dog in backyard'); // summary preserved
  });
});
