import { describe, it, expect } from 'vitest';
import { InspectionTimeWindowService } from '../../../src/shared/domain/inspection-time-window.service';

// Verify the re-export from the original module location still works
import {
  InspectionTimeWindowService as ReExported,
} from '../../../src/modules/inspector-execution/domain/inspection-time-window.service';

describe('InspectionTimeWindowService', () => {
  const service = new InspectionTimeWindowService();

  // scheduledDate is stored as UTC midnight
  const scheduledDate = new Date('2026-03-21T00:00:00Z');

  describe('default bounds (30 min before, 30 min after)', () => {
    describe('morning slot 09:00-11:00', () => {
      const timeSlot = '09:00-11:00';
      // Window opens: 08:30 UTC, closes: 11:30 UTC

      it('should allow exactly at window open (30min before start)', () => {
        const now = new Date('2026-03-21T08:30:00Z');
        const result = service.isWithinWindow(scheduledDate, timeSlot, now);
        expect(result.allowed).toBe(true);
      });

      it('should reject 1 minute before window open with "Too early" reason', () => {
        const now = new Date('2026-03-21T08:29:00Z');
        const result = service.isWithinWindow(scheduledDate, timeSlot, now);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Too early');
      });

      it('should allow at window close (30min after end)', () => {
        const now = new Date('2026-03-21T11:30:00Z');
        const result = service.isWithinWindow(scheduledDate, timeSlot, now);
        expect(result.allowed).toBe(true);
      });

      it('should reject 1 minute after window close with "Too late" reason', () => {
        const now = new Date('2026-03-21T11:31:00Z');
        const result = service.isWithinWindow(scheduledDate, timeSlot, now);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Too late');
      });

      it('should allow mid-window', () => {
        const now = new Date('2026-03-21T10:00:00Z');
        const result = service.isWithinWindow(scheduledDate, timeSlot, now);
        expect(result.allowed).toBe(true);
      });
    });

    describe('afternoon slot 14:00-17:00', () => {
      const timeSlot = '14:00-17:00';
      // Window opens: 13:30 UTC, closes: 17:30 UTC

      it('should allow exactly at window open', () => {
        const now = new Date('2026-03-21T13:30:00Z');
        const result = service.isWithinWindow(scheduledDate, timeSlot, now);
        expect(result.allowed).toBe(true);
      });

      it('should reject before window open', () => {
        const now = new Date('2026-03-21T13:29:00Z');
        const result = service.isWithinWindow(scheduledDate, timeSlot, now);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Too early');
      });

      it('should allow at window close', () => {
        const now = new Date('2026-03-21T17:30:00Z');
        const result = service.isWithinWindow(scheduledDate, timeSlot, now);
        expect(result.allowed).toBe(true);
      });

      it('should reject after window close', () => {
        const now = new Date('2026-03-21T17:31:00Z');
        const result = service.isWithinWindow(scheduledDate, timeSlot, now);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Too late');
      });

      it('should allow mid-window', () => {
        const now = new Date('2026-03-21T15:30:00Z');
        const result = service.isWithinWindow(scheduledDate, timeSlot, now);
        expect(result.allowed).toBe(true);
      });
    });
  });

  describe('custom bounds', () => {
    const timeSlot = '09:00-11:00';

    it('should use custom beforeMinutes (60 min before)', () => {
      // Window opens: 08:00 UTC with 60 min before
      const now = new Date('2026-03-21T08:00:00Z');
      const result = service.isWithinWindow(scheduledDate, timeSlot, now, {
        beforeMinutes: 60,
      });
      expect(result.allowed).toBe(true);
    });

    it('should reject when outside custom beforeMinutes', () => {
      // 60 min before → opens at 08:00, so 07:59 should fail
      const now = new Date('2026-03-21T07:59:00Z');
      const result = service.isWithinWindow(scheduledDate, timeSlot, now, {
        beforeMinutes: 60,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Too early');
    });

    it('should use custom afterMinutes (60 min after)', () => {
      // Window closes: 12:00 UTC with 60 min after end (11:00)
      const now = new Date('2026-03-21T12:00:00Z');
      const result = service.isWithinWindow(scheduledDate, timeSlot, now, {
        afterMinutes: 60,
      });
      expect(result.allowed).toBe(true);
    });

    it('should reject when outside custom afterMinutes', () => {
      // 60 min after end → closes at 12:00, so 12:01 should fail
      const now = new Date('2026-03-21T12:01:00Z');
      const result = service.isWithinWindow(scheduledDate, timeSlot, now, {
        afterMinutes: 60,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Too late');
    });

    it('should support zero beforeMinutes (no early entry)', () => {
      // With 0 before → opens exactly at 09:00
      const at0859 = new Date('2026-03-21T08:59:00Z');
      const at0900 = new Date('2026-03-21T09:00:00Z');

      expect(service.isWithinWindow(scheduledDate, timeSlot, at0859, {
        beforeMinutes: 0,
      }).allowed).toBe(false);

      expect(service.isWithinWindow(scheduledDate, timeSlot, at0900, {
        beforeMinutes: 0,
      }).allowed).toBe(true);
    });

    it('should support zero afterMinutes (no late grace)', () => {
      // With 0 after → closes exactly at 11:00
      const at1100 = new Date('2026-03-21T11:00:00Z');
      const at1101 = new Date('2026-03-21T11:01:00Z');

      expect(service.isWithinWindow(scheduledDate, timeSlot, at1100, {
        afterMinutes: 0,
      }).allowed).toBe(true);

      expect(service.isWithinWindow(scheduledDate, timeSlot, at1101, {
        afterMinutes: 0,
      }).allowed).toBe(false);
    });

    it('should support both custom bounds together', () => {
      // 15 min before, 45 min after → opens 08:45, closes 11:45
      const bounds = { beforeMinutes: 15, afterMinutes: 45 };

      expect(service.isWithinWindow(scheduledDate, timeSlot,
        new Date('2026-03-21T08:45:00Z'), bounds,
      ).allowed).toBe(true);

      expect(service.isWithinWindow(scheduledDate, timeSlot,
        new Date('2026-03-21T08:44:00Z'), bounds,
      ).allowed).toBe(false);

      expect(service.isWithinWindow(scheduledDate, timeSlot,
        new Date('2026-03-21T11:45:00Z'), bounds,
      ).allowed).toBe(true);

      expect(service.isWithinWindow(scheduledDate, timeSlot,
        new Date('2026-03-21T11:46:00Z'), bounds,
      ).allowed).toBe(false);
    });

    it('should support maximum bounds (120 min)', () => {
      // 120 min before → opens 07:00, 120 min after → closes 13:00
      const bounds = { beforeMinutes: 120, afterMinutes: 120 };

      expect(service.isWithinWindow(scheduledDate, timeSlot,
        new Date('2026-03-21T07:00:00Z'), bounds,
      ).allowed).toBe(true);

      expect(service.isWithinWindow(scheduledDate, timeSlot,
        new Date('2026-03-21T13:00:00Z'), bounds,
      ).allowed).toBe(true);
    });

    it('should fall back to defaults when partial bounds provided', () => {
      // Only afterMinutes specified → beforeMinutes defaults to 30
      // Window opens: 08:30 (30 min default before 09:00)
      const now = new Date('2026-03-21T08:30:00Z');
      const result = service.isWithinWindow(scheduledDate, timeSlot, now, {
        afterMinutes: 60,
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should reject when now is the day before the scheduled date', () => {
      const now = new Date('2026-03-20T08:30:00Z');
      const result = service.isWithinWindow(scheduledDate, '09:00-11:00', now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Too early');
    });

    it('should reject when now is the day after the scheduled date', () => {
      const now = new Date('2026-03-22T10:00:00Z');
      const result = service.isWithinWindow(scheduledDate, '09:00-11:00', now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Too late');
    });

    it('should return not allowed for invalid time slot format', () => {
      const now = new Date('2026-03-21T10:00:00Z');
      const result = service.isWithinWindow(scheduledDate, 'invalid', now);
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
        '09:00-11:00',
        new Date('2026-03-21T10:00:00Z'),
      );
      expect(result.allowed).toBe(true);
    });
  });
});
