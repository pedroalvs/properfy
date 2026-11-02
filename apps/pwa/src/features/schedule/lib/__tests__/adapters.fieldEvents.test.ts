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
      rentalTenantNote: null,
      observation: null,
      ...overrides,
    },
  };
}

describe('mapInspectorAppointmentDetail — F03 field-event fields', () => {
  it('maps geofence, lastFieldIssue and publishedServiceStartAt when present', () => {
    const result = mapInspectorAppointmentDetail(
      makeResponse({
        geofence: { radiusMeters: 150, mode: 'BLOCK' },
        lastFieldIssue: { reason: 'KEY_FAILED', note: 'No lockbox', occurredAt: '2026-11-03T09:41:00.000Z' },
        publishedServiceStartAt: '2026-11-03T10:15:00.000+11:00',
      }),
    );

    expect(result.geofence).toEqual({ radiusMeters: 150, mode: 'BLOCK' });
    expect(result.lastFieldIssue).toEqual({
      reason: 'KEY_FAILED',
      note: 'No lockbox',
      occurredAt: '2026-11-03T09:41:00.000Z',
    });
    expect(result.publishedServiceStartAt).toBe('2026-11-03T10:15:00.000+11:00');
  });

  it('defaults lastFieldIssue and publishedServiceStartAt to null and leaves geofence undefined when absent', () => {
    const result = mapInspectorAppointmentDetail(makeResponse());

    expect(result.geofence).toBeUndefined();
    expect(result.lastFieldIssue).toBeNull();
    expect(result.publishedServiceStartAt).toBeNull();
  });
});
