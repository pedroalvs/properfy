import { useScheduleDay } from '../useScheduleDay';
import { renderHook } from '@testing-library/react';
import { AppointmentStatus, RentalTenantConfirmationStatus, ServiceTypeFlowType } from '@properfy/shared';
import type { InspectorAppointment } from '../../types';

function makeApt(overrides: Partial<InspectorAppointment> = {}): InspectorAppointment {
  return {
    id: 'apt-1',
    appointmentCode: 'INS-0001',
    propertyAddress: '123 Test St',
    suburb: 'TestSuburb',
    scheduledDate: '2026-03-18',
    timeSlotStart: '09:00',
    timeSlotEnd: '11:00',
    status: AppointmentStatus.SCHEDULED,
    rentalTenantConfirmation: RentalTenantConfirmationStatus.CONFIRMED,
    serviceTypeName: 'Routine',
    flowType: ServiceTypeFlowType.ROUTINE,
    rentalTenantName: 'Test',
    rentalTenantPhone: null,
    rentalTenantEmail: null,
    keyRequired: false,
    meetingLocation: null,
    restrictions: null,
    propertyLatitude: null,
    propertyLongitude: null,
    notes: null,
    ...overrides,
  };
}

describe('useScheduleDay', () => {
  it('returns empty array when appointments is undefined', () => {
    const { result } = renderHook(() => useScheduleDay(undefined, '2026-03-18'));
    expect(result.current).toEqual([]);
  });

  it('filters appointments by selected date', () => {
    const appointments = [
      makeApt({ id: '1', scheduledDate: '2026-03-18', timeSlotStart: '09:00' }),
      makeApt({ id: '2', scheduledDate: '2026-03-19', timeSlotStart: '09:00' }),
    ];
    const { result } = renderHook(() => useScheduleDay(appointments, '2026-03-18'));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe('1');
  });

  it('sorts by start time ascending', () => {
    const appointments = [
      makeApt({ id: '2', timeSlotStart: '14:00', timeSlotEnd: '16:00', suburb: 'A' }),
      makeApt({ id: '1', timeSlotStart: '09:00', timeSlotEnd: '11:00', suburb: 'A' }),
    ];
    const { result } = renderHook(() => useScheduleDay(appointments, '2026-03-18'));
    expect(result.current[0].id).toBe('1');
    expect(result.current[1].id).toBe('2');
  });

  it('sorts by suburb when times are equal', () => {
    const appointments = [
      makeApt({ id: '2', timeSlotStart: '09:00', timeSlotEnd: '11:00', suburb: 'Collingwood' }),
      makeApt({ id: '1', timeSlotStart: '09:00', timeSlotEnd: '11:00', suburb: 'Brunswick' }),
    ];
    const { result } = renderHook(() => useScheduleDay(appointments, '2026-03-18'));
    expect(result.current[0].id).toBe('1'); // Brunswick first
    expect(result.current[1].id).toBe('2');
  });
});
