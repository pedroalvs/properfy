import { useScheduleDay } from '../useScheduleDay';
import { renderHook } from '@testing-library/react';
import { AppointmentStatus, TenantConfirmationStatus, ServiceTypeFlowType } from '@properfy/shared';
import type { InspectorAppointment } from '../../types';

function makeApt(overrides: Partial<InspectorAppointment> = {}): InspectorAppointment {
  return {
    id: 'apt-1',
    propertyAddress: '123 Test St',
    suburb: 'TestSuburb',
    timeSlotStart: '2026-03-18T09:00:00.000Z',
    timeSlotEnd: '2026-03-18T11:00:00.000Z',
    status: AppointmentStatus.SCHEDULED,
    tenantConfirmation: TenantConfirmationStatus.CONFIRMED,
    serviceTypeName: 'Routine',
    flowType: ServiceTypeFlowType.ROUTINE,
    tenantName: 'Test',
    tenantPhone: null,
    tenantEmail: null,
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
      makeApt({ id: '1', timeSlotStart: '2026-03-18T09:00:00.000Z' }),
      makeApt({ id: '2', timeSlotStart: '2026-03-19T09:00:00.000Z' }),
    ];
    const { result } = renderHook(() => useScheduleDay(appointments, '2026-03-18'));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe('1');
  });

  it('sorts by timeSlotStart ascending', () => {
    const appointments = [
      makeApt({ id: '2', timeSlotStart: '2026-03-18T14:00:00.000Z', suburb: 'A' }),
      makeApt({ id: '1', timeSlotStart: '2026-03-18T09:00:00.000Z', suburb: 'A' }),
    ];
    const { result } = renderHook(() => useScheduleDay(appointments, '2026-03-18'));
    expect(result.current[0].id).toBe('1');
    expect(result.current[1].id).toBe('2');
  });

  it('sorts by suburb when times are equal', () => {
    const appointments = [
      makeApt({ id: '2', timeSlotStart: '2026-03-18T09:00:00.000Z', suburb: 'Collingwood' }),
      makeApt({ id: '1', timeSlotStart: '2026-03-18T09:00:00.000Z', suburb: 'Brunswick' }),
    ];
    const { result } = renderHook(() => useScheduleDay(appointments, '2026-03-18'));
    expect(result.current[0].id).toBe('1'); // Brunswick first
    expect(result.current[1].id).toBe('2');
  });
});
