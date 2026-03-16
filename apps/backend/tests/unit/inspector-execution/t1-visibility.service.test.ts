import { describe, it, expect } from 'vitest';
import { T1VisibilityService } from '../../../src/modules/inspector-execution/domain/t1-visibility.service';

describe('T1VisibilityService', () => {
  const service = new T1VisibilityService();

  // Helper: today is March 15, scheduledDate is March 16 (tomorrow = T-1)
  const today = new Date('2026-03-15T12:00:00Z');
  const tomorrow = new Date('2026-03-16T09:00:00Z');
  const dayAfterTomorrow = new Date('2026-03-17T09:00:00Z');
  const todayDate = new Date('2026-03-15T09:00:00Z');

  describe('INGOING appointments', () => {
    it('should always be visible when SCHEDULED', () => {
      expect(service.isVisibleForInspector('INGOING', 'PENDING', false, tomorrow, today)).toBe(true);
    });
  });

  describe('OUTGOING appointments', () => {
    it('should always be visible when SCHEDULED', () => {
      expect(service.isVisibleForInspector('OUTGOING', 'PENDING', false, tomorrow, today)).toBe(true);
    });
  });

  describe('ROUTINE appointments at T-1', () => {
    it('should be visible when tenant confirmation is CONFIRMED', () => {
      expect(service.isVisibleForInspector('ROUTINE', 'CONFIRMED', false, tomorrow, today)).toBe(true);
    });

    it('should be visible when keyRequired is true regardless of confirmation', () => {
      expect(service.isVisibleForInspector('ROUTINE', 'PENDING', true, tomorrow, today)).toBe(true);
    });

    it('should NOT be visible when PENDING confirmation and keyRequired is false', () => {
      expect(service.isVisibleForInspector('ROUTINE', 'PENDING', false, tomorrow, today)).toBe(false);
    });
  });

  describe('ROUTINE appointments beyond T-1', () => {
    it('should be visible when CONFIRMED for future dates', () => {
      expect(service.isVisibleForInspector('ROUTINE', 'CONFIRMED', false, dayAfterTomorrow, today)).toBe(
        true,
      );
    });
  });

  describe('ROUTINE appointments for today (not T-1)', () => {
    it('should always be visible when scheduled for today', () => {
      expect(service.isVisibleForInspector('ROUTINE', 'PENDING', false, todayDate, today)).toBe(true);
    });
  });
});
