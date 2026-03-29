import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isAppointmentOverdue } from './overdue';

describe('isAppointmentOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for SCHEDULED appointment with past date', () => {
    expect(isAppointmentOverdue('SCHEDULED', '2026-03-28')).toBe(true);
  });

  it('returns true for AWAITING_INSPECTOR appointment with past date', () => {
    expect(isAppointmentOverdue('AWAITING_INSPECTOR', '2026-03-27')).toBe(true);
  });

  it('returns false for SCHEDULED appointment with today date', () => {
    expect(isAppointmentOverdue('SCHEDULED', '2026-03-29')).toBe(false);
  });

  it('returns false for SCHEDULED appointment with future date', () => {
    expect(isAppointmentOverdue('SCHEDULED', '2026-04-05')).toBe(false);
  });

  it('returns false for DONE appointment with past date', () => {
    expect(isAppointmentOverdue('DONE', '2026-03-20')).toBe(false);
  });

  it('returns false for CANCELLED appointment with past date', () => {
    expect(isAppointmentOverdue('CANCELLED', '2026-03-20')).toBe(false);
  });

  it('returns false for REJECTED appointment with past date', () => {
    expect(isAppointmentOverdue('REJECTED', '2026-03-20')).toBe(false);
  });

  it('returns false for DRAFT appointment with past date', () => {
    expect(isAppointmentOverdue('DRAFT', '2026-03-20')).toBe(false);
  });

  it('accepts Date objects', () => {
    expect(isAppointmentOverdue('SCHEDULED', new Date('2026-03-28T00:00:00Z'))).toBe(true);
  });

  it('accepts ISO datetime strings', () => {
    expect(isAppointmentOverdue('SCHEDULED', '2026-03-28T14:00:00.000Z')).toBe(true);
  });
});
