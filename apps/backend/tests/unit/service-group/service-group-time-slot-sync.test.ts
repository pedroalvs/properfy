import { describe, expect, it } from 'vitest';
import { getServiceGroupTimeSlotAdjustment } from '../../../src/modules/service-group/domain/service-group-time-slot-sync';

describe('getServiceGroupTimeSlotAdjustment', () => {
  it('keeps appointments fully inside the group time window unchanged', () => {
    expect(getServiceGroupTimeSlotAdjustment(
      { timeSlotStart: '09:30', timeSlotEnd: '10:30' },
      '09:00-12:00',
    )).toBeNull();
  });

  it.each([
    ['08:00', '10:00'],
    ['11:00', '13:00'],
    ['13:00', '14:00'],
  ])('syncs %s-%s to the full group time window when any part is outside', (timeSlotStart, timeSlotEnd) => {
    expect(getServiceGroupTimeSlotAdjustment(
      { timeSlotStart, timeSlotEnd },
      '09:00-12:00',
    )).toEqual({
      timeSlotStart: '09:00',
      timeSlotEnd: '12:00',
      before: { timeSlotStart, timeSlotEnd },
    });
  });

  it('skips malformed legacy appointment times instead of throwing', () => {
    expect(getServiceGroupTimeSlotAdjustment(
      { timeSlotStart: '010:00', timeSlotEnd: '11:00' },
      '09:00-12:00',
    )).toBeNull();
  });
});
