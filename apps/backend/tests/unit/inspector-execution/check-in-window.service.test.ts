import { describe, it, expect } from 'vitest';
import { zonedWallTimeToUtc } from '@properfy/shared';
import { isOutOfCheckInWindow } from '../../../src/modules/inspector-execution/domain/check-in-window.service';

const TZ = 'Australia/Sydney';
const DATE = '2026-11-03';
// A check-in instant given as a bare wall time on DATE in the agency timezone.
const at = (hhmm: string, date = DATE) => zonedWallTimeToUtc(date, hhmm, TZ);

const base = {
  scheduledDate: DATE,
  timeSlotStart: '09:00',
  timeSlotEnd: '11:00',
  toleranceMinutes: 15,
  timeZone: TZ,
};

describe('isOutOfCheckInWindow', () => {
  it('is inside at the lower tolerance edge (08:45) and just outside before it (08:44)', () => {
    expect(isOutOfCheckInWindow({ ...base, effectiveAt: at('08:45') })).toBe(false);
    expect(isOutOfCheckInWindow({ ...base, effectiveAt: at('08:44') })).toBe(true);
  });

  it('is inside at the upper tolerance edge (11:15) and just outside after it (11:16)', () => {
    expect(isOutOfCheckInWindow({ ...base, effectiveAt: at('11:15') })).toBe(false);
    expect(isOutOfCheckInWindow({ ...base, effectiveAt: at('11:16') })).toBe(true);
  });

  it('is out of window the day after the scheduled date (same wall time)', () => {
    expect(isOutOfCheckInWindow({ ...base, effectiveAt: at('10:00', '2026-11-04') })).toBe(true);
  });

  it('with zero tolerance, exactly at slot start is inside', () => {
    expect(isOutOfCheckInWindow({ ...base, toleranceMinutes: 0, effectiveAt: at('09:00') })).toBe(false);
    expect(isOutOfCheckInWindow({ ...base, toleranceMinutes: 0, effectiveAt: at('08:59') })).toBe(true);
  });

  it('evaluates the window in the agency timezone, not the process timezone', () => {
    // 08:50 Sydney wall time is inside; the same instant expressed in UTC
    // would fall on a different clock face, so this guards against UTC math.
    expect(isOutOfCheckInWindow({ ...base, effectiveAt: at('08:50') })).toBe(false);
  });
});
