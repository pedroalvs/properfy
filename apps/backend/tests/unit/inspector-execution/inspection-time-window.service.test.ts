import { describe, it, expect } from 'vitest';
import { PLATFORM_TIMEZONE, zonedWallTimeToUtc } from '@properfy/shared';
import { InspectionTimeWindowService } from '../../../src/shared/domain/inspection-time-window.service';

// Verify the re-export from the original module location still works
import {
  InspectionTimeWindowService as ReExported,
} from '../../../src/modules/inspector-execution/domain/inspection-time-window.service';

/** UTC instant for a Sydney wall time on the given civil date. */
const sydney = (date: string, time: string): Date =>
  zonedWallTimeToUtc(date, time, PLATFORM_TIMEZONE);

describe('InspectionTimeWindowService', () => {
  const service = new InspectionTimeWindowService();

  // scheduledDate is stored as UTC midnight (civil date); slots are Sydney wall times.
  // 2026-03-21 is AEDT (UTC+11).
  const scheduledDate = new Date('2026-03-21T00:00:00Z');
  const civilDate = '2026-03-21';

  describe('default bounds (30 min before, 30 min after)', () => {
    describe('morning slot 09:00-11:00', () => {
      const timeSlotStart = '09:00';
      const timeSlotEnd = '11:00';
      // Window opens: 08:30 Sydney, closes: 11:30 Sydney

      it('should allow exactly at window open (30min before start)', () => {
        const now = sydney(civilDate, '08:30');
        const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now);
        expect(result.allowed).toBe(true);
      });

      it('should reject 1 minute before window open with "Too early" reason', () => {
        const now = sydney(civilDate, '08:29');
        const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Too early');
      });

      it('should allow at window close (30min after end)', () => {
        const now = sydney(civilDate, '11:30');
        const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now);
        expect(result.allowed).toBe(true);
      });

      it('should reject 1 minute after window close with "Too late" reason', () => {
        const now = sydney(civilDate, '11:31');
        const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Too late');
      });

      it('should allow mid-window', () => {
        const now = sydney(civilDate, '10:00');
        const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now);
        expect(result.allowed).toBe(true);
      });
    });

    describe('afternoon slot 14:00-17:00', () => {
      const timeSlotStart = '14:00';
      const timeSlotEnd = '17:00';
      // Window opens: 13:30 Sydney, closes: 17:30 Sydney

      it('should allow exactly at window open', () => {
        const now = sydney(civilDate, '13:30');
        const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now);
        expect(result.allowed).toBe(true);
      });

      it('should reject before window open', () => {
        const now = sydney(civilDate, '13:29');
        const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Too early');
      });

      it('should allow at window close', () => {
        const now = sydney(civilDate, '17:30');
        const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now);
        expect(result.allowed).toBe(true);
      });

      it('should reject after window close', () => {
        const now = sydney(civilDate, '17:31');
        const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Too late');
      });

      it('should allow mid-window', () => {
        const now = sydney(civilDate, '15:30');
        const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now);
        expect(result.allowed).toBe(true);
      });
    });
  });

  describe('custom bounds', () => {
    const timeSlotStart = '09:00';
    const timeSlotEnd = '11:00';

    it('should use custom beforeMinutes (60 min before)', () => {
      // Window opens: 08:00 Sydney with 60 min before
      const now = sydney(civilDate, '08:00');
      const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now, {
        beforeMinutes: 60,
      });
      expect(result.allowed).toBe(true);
    });

    it('should reject when outside custom beforeMinutes', () => {
      // 60 min before → opens at 08:00 Sydney, so 07:59 should fail
      const now = sydney(civilDate, '07:59');
      const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now, {
        beforeMinutes: 60,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Too early');
    });

    it('should use custom afterMinutes (60 min after)', () => {
      // Window closes: 12:00 Sydney with 60 min after end (11:00)
      const now = sydney(civilDate, '12:00');
      const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now, {
        afterMinutes: 60,
      });
      expect(result.allowed).toBe(true);
    });

    it('should reject when outside custom afterMinutes', () => {
      // 60 min after end → closes at 12:00 Sydney, so 12:01 should fail
      const now = sydney(civilDate, '12:01');
      const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now, {
        afterMinutes: 60,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Too late');
    });

    it('should support zero beforeMinutes (no early entry)', () => {
      // With 0 before → opens exactly at 09:00 Sydney
      const at0859 = sydney(civilDate, '08:59');
      const at0900 = sydney(civilDate, '09:00');

      expect(service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, at0859, {
        beforeMinutes: 0,
      }).allowed).toBe(false);

      expect(service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, at0900, {
        beforeMinutes: 0,
      }).allowed).toBe(true);
    });

    it('should support zero afterMinutes (no late grace)', () => {
      // With 0 after → closes exactly at 11:00 Sydney
      const at1100 = sydney(civilDate, '11:00');
      const at1101 = sydney(civilDate, '11:01');

      expect(service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, at1100, {
        afterMinutes: 0,
      }).allowed).toBe(true);

      expect(service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, at1101, {
        afterMinutes: 0,
      }).allowed).toBe(false);
    });

    it('should support both custom bounds together', () => {
      // 15 min before, 45 min after → opens 08:45 Sydney, closes 11:45 Sydney
      const bounds = { beforeMinutes: 15, afterMinutes: 45 };

      expect(service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd,
        sydney(civilDate, '08:45'), bounds,
      ).allowed).toBe(true);

      expect(service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd,
        sydney(civilDate, '08:44'), bounds,
      ).allowed).toBe(false);

      expect(service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd,
        sydney(civilDate, '11:45'), bounds,
      ).allowed).toBe(true);

      expect(service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd,
        sydney(civilDate, '11:46'), bounds,
      ).allowed).toBe(false);
    });

    it('should support maximum bounds (120 min)', () => {
      // 120 min before → opens 07:00 Sydney, 120 min after → closes 13:00 Sydney
      const bounds = { beforeMinutes: 120, afterMinutes: 120 };

      expect(service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd,
        sydney(civilDate, '07:00'), bounds,
      ).allowed).toBe(true);

      expect(service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd,
        sydney(civilDate, '13:00'), bounds,
      ).allowed).toBe(true);
    });

    it('should fall back to defaults when partial bounds provided', () => {
      // Only afterMinutes specified → beforeMinutes defaults to 30
      // Window opens: 08:30 Sydney (30 min default before 09:00)
      const now = sydney(civilDate, '08:30');
      const result = service.isWithinWindow(scheduledDate, timeSlotStart, timeSlotEnd, now, {
        afterMinutes: 60,
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should reject when now is the day before the scheduled date', () => {
      const now = sydney('2026-03-20', '08:30');
      const result = service.isWithinWindow(scheduledDate, '09:00', '11:00', now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Too early');
    });

    it('should reject when now is the day after the scheduled date', () => {
      const now = sydney('2026-03-22', '10:00');
      const result = service.isWithinWindow(scheduledDate, '09:00', '11:00', now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Too late');
    });

    it('should return not allowed for invalid time slot format', () => {
      const now = sydney(civilDate, '10:00');
      const result = service.isWithinWindow(scheduledDate, '', '', now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid time slot format');
    });
  });

  describe('GAP-010: shared location re-export', () => {
    it('should export the same class from the inspector-execution re-export', () => {
      expect(ReExported).toBe(InspectionTimeWindowService);
    });

    it('should work identically when instantiated from the re-export', () => {
      const reExportedService = new ReExported();
      const result = reExportedService.isWithinWindow(
        scheduledDate,
        '09:00',
        '11:00',
        sydney(civilDate, '10:00'),
      );
      expect(result.allowed).toBe(true);
    });
  });
});
