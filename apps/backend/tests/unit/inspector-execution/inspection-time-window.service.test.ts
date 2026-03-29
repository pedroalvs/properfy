import { describe, it, expect } from 'vitest';
import { InspectionTimeWindowService } from '../../../src/modules/inspector-execution/domain/inspection-time-window.service';

describe('InspectionTimeWindowService', () => {
  const service = new InspectionTimeWindowService();

  // scheduledDate is stored as UTC midnight
  const scheduledDate = new Date('2026-03-21T00:00:00Z');

  describe('morning slot 09:00-11:00', () => {
    const timeSlot = '09:00-11:00';
    // Window opens: 08:30 UTC, closes: 13:00 UTC

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

    it('should allow at window close (2h after end)', () => {
      const now = new Date('2026-03-21T13:00:00Z');
      const result = service.isWithinWindow(scheduledDate, timeSlot, now);
      expect(result.allowed).toBe(true);
    });

    it('should reject 1 minute after window close with "Too late" reason', () => {
      const now = new Date('2026-03-21T13:01:00Z');
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
    // Window opens: 13:30 UTC, closes: 19:00 UTC

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
      const now = new Date('2026-03-21T19:00:00Z');
      const result = service.isWithinWindow(scheduledDate, timeSlot, now);
      expect(result.allowed).toBe(true);
    });

    it('should reject after window close', () => {
      const now = new Date('2026-03-21T19:01:00Z');
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
});
