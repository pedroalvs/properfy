import { describe, it, expect } from 'vitest';
import { PLATFORM_TIMEZONE, zonedWallTimeToUtc } from '@properfy/shared';
import { InspectionStartGateService } from '../../../src/shared/domain/inspection-start-gate.service';

/** UTC instant for a Sydney wall time on the given civil date. */
const sydney = (date: string, time: string): Date =>
  zonedWallTimeToUtc(date, time, PLATFORM_TIMEZONE);

/** `scheduled_date` is a @db.Date pinned to UTC midnight of the civil date. */
const scheduled = (civilDate: string): Date => new Date(`${civilDate}T00:00:00Z`);

describe('InspectionStartGateService', () => {
  const service = new InspectionStartGateService();

  // 2026-03-21 is AEDT (UTC+11).
  const civilDate = '2026-03-21';
  const scheduledDate = scheduled(civilDate);

  describe('before the scheduled day', () => {
    it('rejects one millisecond before midnight opens the day', () => {
      const now = new Date(sydney(civilDate, '00:00').getTime() - 1);
      const result = service.isStartAllowed(scheduledDate, now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Too early');
    });

    it('rejects at 23:59 Sydney on the day before', () => {
      const now = sydney('2026-03-20', '23:59');
      expect(service.isStartAllowed(scheduledDate, now).allowed).toBe(false);
    });

    it('rejects ten days out', () => {
      const now = sydney('2026-03-11', '09:00');
      expect(service.isStartAllowed(scheduledDate, now).allowed).toBe(false);
    });

    it('names the calendar day, never a raw UTC instant', () => {
      // The reason travels in the error envelope's `message` and the PWA shows
      // it verbatim in a snackbar, so it has to read like a date to a human.
      const { reason } = service.isStartAllowed(scheduledDate, sydney('2026-03-20', '23:59'));
      expect(reason).toContain('21/03/2026');
      expect(reason).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(reason).not.toContain('Z');
    });
  });

  describe('on the scheduled day — the whole day is open', () => {
    it('allows at exactly midnight Sydney', () => {
      const now = sydney(civilDate, '00:00');
      expect(service.isStartAllowed(scheduledDate, now).allowed).toBe(true);
    });

    it('allows hours before the time slot (06:00 for a 09:00-11:00 slot)', () => {
      const now = sydney(civilDate, '06:00');
      expect(service.isStartAllowed(scheduledDate, now).allowed).toBe(true);
    });

    it('allows during the time slot', () => {
      const now = sydney(civilDate, '10:00');
      expect(service.isStartAllowed(scheduledDate, now).allowed).toBe(true);
    });

    it('allows long after the time slot closed (23:30 for a 09:00-11:00 slot)', () => {
      const now = sydney(civilDate, '23:30');
      expect(service.isStartAllowed(scheduledDate, now).allowed).toBe(true);
    });
  });

  describe('after the scheduled day — still open', () => {
    it('allows the next day', () => {
      const now = sydney('2026-03-22', '09:00');
      expect(service.isStartAllowed(scheduledDate, now).allowed).toBe(true);
    });

    it('allows ten days later', () => {
      const now = sydney('2026-03-31', '09:00');
      expect(service.isStartAllowed(scheduledDate, now).allowed).toBe(true);
    });

    it('allows a year later — there is no upper bound', () => {
      const now = sydney('2027-03-21', '09:00');
      expect(service.isStartAllowed(scheduledDate, now).allowed).toBe(true);
    });
  });

  describe('the gate opens at Sydney midnight, not UTC midnight', () => {
    // Hard-coded UTC instants on purpose: deriving them from zonedWallTimeToUtc
    // (the helper the implementation itself uses) would cancel out a bug in it.

    it('opens at 13:00Z the previous day during AEDT (UTC+11)', () => {
      const aedt = scheduled('2026-03-21');
      expect(service.isStartAllowed(aedt, new Date('2026-03-20T12:59:59Z')).allowed).toBe(false);
      expect(service.isStartAllowed(aedt, new Date('2026-03-20T13:00:00Z')).allowed).toBe(true);
    });

    it('opens at 14:00Z the previous day during AEST (UTC+10)', () => {
      const aest = scheduled('2026-07-15');
      expect(service.isStartAllowed(aest, new Date('2026-07-14T13:59:59Z')).allowed).toBe(false);
      expect(service.isStartAllowed(aest, new Date('2026-07-14T14:00:00Z')).allowed).toBe(true);
    });

    it('opens correctly on the day DST ends (2026-04-05, clocks go back)', () => {
      // Midnight on 2026-04-05 is still AEDT (UTC+11); the change happens at 03:00 local.
      const dstEnds = scheduled('2026-04-05');
      expect(service.isStartAllowed(dstEnds, new Date('2026-04-04T12:59:59Z')).allowed).toBe(false);
      expect(service.isStartAllowed(dstEnds, new Date('2026-04-04T13:00:00Z')).allowed).toBe(true);
    });

    it('opens correctly on the day DST starts (2026-10-04, clocks go forward)', () => {
      // Midnight on 2026-10-04 is still AEST (UTC+10); the change happens at 02:00 local.
      const dstStarts = scheduled('2026-10-04');
      expect(service.isStartAllowed(dstStarts, new Date('2026-10-03T13:59:59Z')).allowed).toBe(false);
      expect(service.isStartAllowed(dstStarts, new Date('2026-10-03T14:00:00Z')).allowed).toBe(true);
    });

    it('rejects a UTC instant that is already the scheduled day in UTC but not yet in Sydney', () => {
      // 2026-03-21T00:00Z is 11:00 Sydney on 2026-03-21 — allowed.
      // But 2026-03-20T20:00Z is 07:00 Sydney on 2026-03-21 — also allowed.
      // The interesting direction is the reverse: late on the 20th UTC is already
      // the 21st in Sydney, so a UTC-based gate would wrongly reject it.
      expect(service.isStartAllowed(scheduledDate, new Date('2026-03-20T20:00:00Z')).allowed).toBe(
        true,
      );
    });

    it('opens at the AGENCY timezone midnight when one is supplied', () => {
      // 2026-03-20T11:30:00Z is already 2026-03-21 00:30 in Auckland (UTC+13,
      // NZDT) but still 22:30 on the 20th in Sydney (UTC+11). The gate must
      // follow the agency's local midnight, not the platform's.
      const at = new Date('2026-03-20T11:30:00.000Z');
      expect(service.isStartAllowed(scheduledDate, at, 'Pacific/Auckland').allowed).toBe(true);
      expect(service.isStartAllowed(scheduledDate, at, 'Australia/Sydney').allowed).toBe(false);
    });
  });
});
