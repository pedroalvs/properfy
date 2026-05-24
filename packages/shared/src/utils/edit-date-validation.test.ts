/**
 * Unit tests for TZ-aware date/time validation helpers.
 *
 * Uses vi.setSystemTime to freeze the clock so results are deterministic.
 * All assertions use IANA timezone 'Australia/Sydney' (UTC+11 in summer)
 * to exercise the TZ-conversion path; UTC-only code would pass trivially.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { todayInTzDateString, currentTimeInTzHHmm, isTimeStartInPastForDate } from './local-date';
import { validateNewSchedule, validateEditedSchedule } from './edit-date-validation';

// 2026-06-15 09:00 UTC = 2026-06-15 19:00 AEST (UTC+10 winter)
const FROZEN_UTC = new Date('2026-06-15T09:00:00.000Z');
const TZ = 'Australia/Sydney'; // AEST in June (UTC+10, no DST)

beforeEach(() => vi.useFakeTimers({ now: FROZEN_UTC }));
afterEach(() => vi.useRealTimers());

describe('todayInTzDateString', () => {
  it('returns today in AEST (same calendar day as UTC at 09:00 UTC)', () => {
    // 09:00 UTC = 19:00 AEST; same date
    expect(todayInTzDateString(TZ)).toBe('2026-06-15');
  });

  it('returns next calendar day when AEST crosses midnight ahead of UTC', () => {
    // 15:00 UTC = 01:00 AEST next day (June 16)
    vi.setSystemTime(new Date('2026-06-15T15:00:00.000Z'));
    expect(todayInTzDateString(TZ)).toBe('2026-06-16');
  });
});

describe('currentTimeInTzHHmm', () => {
  it('returns HH:mm in AEST (09:00 UTC = 19:00 AEST)', () => {
    expect(currentTimeInTzHHmm(TZ)).toBe('19:00');
  });
});

describe('isTimeStartInPastForDate', () => {
  it('returns true for a slot that started before 19:00 when date = today', () => {
    expect(isTimeStartInPastForDate('09:00-10:00', '2026-06-15', TZ)).toBe(true);
  });

  it('returns false for a slot starting after 19:00 when date = today', () => {
    expect(isTimeStartInPastForDate('20:00-21:00', '2026-06-15', TZ)).toBe(false);
  });

  it('returns false for any slot on a future date', () => {
    expect(isTimeStartInPastForDate('06:00-07:00', '2026-06-16', TZ)).toBe(false);
  });
});

describe('validateNewSchedule', () => {
  it('ok: future date', () => {
    expect(validateNewSchedule({ date: '2026-06-20', timeSlot: '09:00-10:00', tz: TZ })).toEqual({ ok: true });
  });

  it('error DATE_IN_PAST: past date', () => {
    expect(validateNewSchedule({ date: '2026-06-10', timeSlot: '09:00-10:00', tz: TZ })).toEqual({ ok: false, code: 'DATE_IN_PAST' });
  });

  it('ok: today + future slot', () => {
    expect(validateNewSchedule({ date: '2026-06-15', timeSlot: '20:00-21:00', tz: TZ })).toEqual({ ok: true });
  });

  it('error TIME_IN_PAST: today + past slot', () => {
    expect(validateNewSchedule({ date: '2026-06-15', timeSlot: '09:00-10:00', tz: TZ })).toEqual({ ok: false, code: 'TIME_IN_PAST' });
  });
});

describe('validateEditedSchedule', () => {
  const existing = { existingDate: '2026-06-15', existingTimeSlot: '09:00-10:00' };

  it('ok: nothing changed', () => {
    expect(validateEditedSchedule({ ...existing, tz: TZ })).toEqual({ ok: true });
  });

  it('ok: date moves to future (same slot — slot check skipped on future date)', () => {
    expect(validateEditedSchedule({ ...existing, newDate: '2026-06-20', tz: TZ })).toEqual({ ok: true });
  });

  it('error DATE_IN_PAST: date changed to past date', () => {
    expect(validateEditedSchedule({ ...existing, newDate: '2026-06-10', tz: TZ })).toEqual({ ok: false, code: 'DATE_IN_PAST' });
  });

  it('ok: date unchanged (today), slot changed to future slot', () => {
    expect(validateEditedSchedule({ ...existing, newTimeSlot: '20:00-21:00', tz: TZ })).toEqual({ ok: true });
  });

  it('error TIME_IN_PAST: date unchanged (today), slot changed to past slot', () => {
    expect(validateEditedSchedule({ ...existing, newTimeSlot: '08:00-09:00', tz: TZ })).toEqual({ ok: false, code: 'TIME_IN_PAST' });
  });
});
