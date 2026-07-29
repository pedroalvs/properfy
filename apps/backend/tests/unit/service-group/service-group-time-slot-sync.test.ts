import { describe, expect, it } from 'vitest';
import {
  getServiceGroupTimeSlotAdjustment,
  getServiceGroupTimeWindowExpansion,
} from '../../../src/modules/service-group/domain/service-group-time-slot-sync';

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

describe('getServiceGroupTimeWindowExpansion', () => {
  it('returns null when the appointment already fits the group time window', () => {
    expect(getServiceGroupTimeWindowExpansion(
      { timeSlotStart: '09:30', timeSlotEnd: '10:30' },
      '09:00-12:00',
    )).toBeNull();
  });

  it('returns null when the appointment exactly matches the window bounds', () => {
    expect(getServiceGroupTimeWindowExpansion(
      { timeSlotStart: '09:00', timeSlotEnd: '12:00' },
      '09:00-12:00',
    )).toBeNull();
  });

  it('widens the start when the appointment begins before the window', () => {
    expect(getServiceGroupTimeWindowExpansion(
      { timeSlotStart: '08:00', timeSlotEnd: '10:00' },
      '09:00-12:00',
    )).toEqual({ timeWindow: '08:00-12:00', before: '09:00-12:00' });
  });

  it('widens the end when the appointment runs past the window', () => {
    expect(getServiceGroupTimeWindowExpansion(
      { timeSlotStart: '11:00', timeSlotEnd: '13:00' },
      '09:00-12:00',
    )).toEqual({ timeWindow: '09:00-13:00', before: '09:00-12:00' });
  });

  it('widens both ends when the appointment straddles the whole window', () => {
    expect(getServiceGroupTimeWindowExpansion(
      { timeSlotStart: '07:00', timeSlotEnd: '19:00' },
      '09:00-12:00',
    )).toEqual({ timeWindow: '07:00-19:00', before: '09:00-12:00' });
  });

  it('widens the end for a slot entirely after the window', () => {
    expect(getServiceGroupTimeWindowExpansion(
      { timeSlotStart: '13:00', timeSlotEnd: '14:00' },
      '09:00-12:00',
    )).toEqual({ timeWindow: '09:00-14:00', before: '09:00-12:00' });
  });

  // Mirrors `getServiceGroupTimeSlotAdjustment`: a malformed legacy time is a
  // no-op rather than a throw, so one bad row cannot break a bulk reschedule.
  it('skips malformed appointment times instead of throwing', () => {
    expect(getServiceGroupTimeWindowExpansion(
      { timeSlotStart: '010:00', timeSlotEnd: '11:00' },
      '09:00-12:00',
    )).toBeNull();
  });
});
