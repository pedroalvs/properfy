import { describe, it, expect } from 'vitest';
import { AppointmentStatus } from '@properfy/shared';
import { isAppointmentEditable, isAppointmentScheduleEditable } from './editability';

describe('isAppointmentEditable', () => {
  it('allows only DRAFT and AWAITING_INSPECTOR', () => {
    expect(isAppointmentEditable(AppointmentStatus.DRAFT)).toBe(true);
    expect(isAppointmentEditable(AppointmentStatus.AWAITING_INSPECTOR)).toBe(true);
    expect(isAppointmentEditable(AppointmentStatus.SCHEDULED)).toBe(false);
  });
});

describe('isAppointmentScheduleEditable', () => {
  it.each([
    AppointmentStatus.DRAFT,
    AppointmentStatus.AWAITING_INSPECTOR,
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.REJECTED,
  ])('allows %s', (status) => {
    expect(isAppointmentScheduleEditable(status)).toBe(true);
  });

  it.each([AppointmentStatus.DONE, AppointmentStatus.CANCELLED])('blocks %s', (status) => {
    expect(isAppointmentScheduleEditable(status)).toBe(false);
  });
});
