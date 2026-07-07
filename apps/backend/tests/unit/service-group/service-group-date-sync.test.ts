import { describe, it, expect } from 'vitest';
import { getServiceGroupDateAdjustment, sameUtcDay } from '../../../src/modules/service-group/domain/service-group-date-sync';

describe('sameUtcDay', () => {
  it('matches dates on the same UTC calendar day regardless of time', () => {
    expect(sameUtcDay(new Date('2026-08-01T00:00:00Z'), new Date('2026-08-01T23:59:59Z'))).toBe(true);
  });

  it('does not match different UTC days', () => {
    expect(sameUtcDay(new Date('2026-08-01T00:00:00Z'), new Date('2026-08-02T00:00:00Z'))).toBe(false);
  });
});

describe('getServiceGroupDateAdjustment', () => {
  it('returns null when the appointment is already on the group day', () => {
    expect(getServiceGroupDateAdjustment(
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-01T00:00:00Z'),
    )).toBeNull();
  });

  it('returns the group date with the previous date as before when days differ', () => {
    const appointmentDate = new Date('2026-08-05T00:00:00Z');
    const groupDate = new Date('2026-08-01T00:00:00Z');
    expect(getServiceGroupDateAdjustment(appointmentDate, groupDate)).toEqual({
      scheduledDate: groupDate,
      before: { scheduledDate: appointmentDate },
    });
  });
});
