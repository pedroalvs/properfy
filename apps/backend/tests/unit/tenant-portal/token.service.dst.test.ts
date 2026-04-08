import { describe, it, expect } from 'vitest';
import { TokenService } from '../../../src/modules/tenant-portal/domain/token.service';

describe('TokenService – DST correctness', () => {
  const service = new TokenService();

  // In 2026 for Australia/Sydney:
  // - AEDT → AEST (clocks go back): Sunday 5 April 2026 at 3:00 AM AEDT → 2:00 AM AEST
  //   Before transition: UTC+11 (AEDT). After: UTC+10 (AEST).
  // - AEST → AEDT (clocks go forward): Sunday 4 October 2026 at 2:00 AM AEST → 3:00 AM AEDT
  //   Before transition: UTC+10 (AEST). After: UTC+11 (AEDT).

  describe('April DST transition – AEDT to AEST (clocks go back)', () => {
    it('should expire at 19:00 AEDT when day-before falls before the transition (Apr 4)', () => {
      // Scheduled: 2026-04-05. Day-before: 2026-04-04.
      // April 4 at 19:00 is still AEDT (UTC+11). Transition happens at 3AM on April 5.
      // 19:00 AEDT = 08:00 UTC
      const result = service.computeExpiresAt('2026-04-05', 'Australia/Sydney');

      expect(result.toISOString()).toBe('2026-04-04T08:00:00.000Z');
      expect(result.getUTCHours()).toBe(8);
      expect(result.getUTCDate()).toBe(4);
    });

    it('should expire at 19:00 AEST when day-before falls after the transition (Apr 5)', () => {
      // Scheduled: 2026-04-06. Day-before: 2026-04-05.
      // April 5 at 19:00 is AEST (UTC+10). The transition happened at 3AM that day.
      // 19:00 AEST = 09:00 UTC
      const result = service.computeExpiresAt('2026-04-06', 'Australia/Sydney');

      expect(result.toISOString()).toBe('2026-04-05T09:00:00.000Z');
      expect(result.getUTCHours()).toBe(9);
      expect(result.getUTCDate()).toBe(5);
    });

    it('should show the UTC offset difference between the two sides of the April transition', () => {
      const beforeTransition = service.computeExpiresAt('2026-04-05', 'Australia/Sydney');
      const afterTransition = service.computeExpiresAt('2026-04-06', 'Australia/Sydney');

      // Before: 08:00 UTC (AEDT, +11). After: 09:00 UTC (AEST, +10).
      // One day apart in local time, but UTC gap is 25 hours (not 24)
      // because clocks went back, gaining an hour.
      const diffMs = afterTransition.getTime() - beforeTransition.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      expect(diffHours).toBe(25);
    });
  });

  describe('October DST transition – AEST to AEDT (clocks go forward)', () => {
    it('should expire at 19:00 AEST when day-before falls before the transition (Oct 3)', () => {
      // Scheduled: 2026-10-04. Day-before: 2026-10-03.
      // October 3 at 19:00 is still AEST (UTC+10). Transition happens at 2AM on Oct 4.
      // 19:00 AEST = 09:00 UTC
      const result = service.computeExpiresAt('2026-10-04', 'Australia/Sydney');

      expect(result.toISOString()).toBe('2026-10-03T09:00:00.000Z');
      expect(result.getUTCHours()).toBe(9);
      expect(result.getUTCDate()).toBe(3);
    });

    it('should expire at 19:00 AEDT when day-before falls after the transition (Oct 4)', () => {
      // Scheduled: 2026-10-05. Day-before: 2026-10-04.
      // October 4 at 19:00 is AEDT (UTC+11). The transition happened at 2AM that day.
      // 19:00 AEDT = 08:00 UTC
      const result = service.computeExpiresAt('2026-10-05', 'Australia/Sydney');

      expect(result.toISOString()).toBe('2026-10-04T08:00:00.000Z');
      expect(result.getUTCHours()).toBe(8);
      expect(result.getUTCDate()).toBe(4);
    });

    it('should show the UTC offset difference between the two sides of the October transition', () => {
      const beforeTransition = service.computeExpiresAt('2026-10-04', 'Australia/Sydney');
      const afterTransition = service.computeExpiresAt('2026-10-05', 'Australia/Sydney');

      // Before: 09:00 UTC (AEST, +10). After: 08:00 UTC (AEDT, +11).
      // One day apart in local time, but UTC gap is 23 hours (not 24)
      // because clocks went forward, losing an hour.
      const diffMs = afterTransition.getTime() - beforeTransition.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      expect(diffHours).toBe(23);
    });
  });

  describe('Cross-check: expiry always lands at 19:00 local', () => {
    const formatter = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    function getLocalHour(utcDate: Date): number {
      const parts = formatter.formatToParts(utcDate);
      return Number(parts.find((p) => p.type === 'hour')?.value ?? '-1');
    }

    it.each([
      ['2026-04-05', 'before April DST transition'],
      ['2026-04-06', 'after April DST transition'],
      ['2026-10-04', 'before October DST transition'],
      ['2026-10-05', 'after October DST transition'],
      ['2026-01-15', 'mid-summer AEDT'],
      ['2026-07-15', 'mid-winter AEST'],
    ])('scheduled %s (%s) should produce 19:00 local', (scheduledDate, _label) => {
      const result = service.computeExpiresAt(scheduledDate, 'Australia/Sydney');
      expect(getLocalHour(result)).toBe(19);
    });
  });
});
