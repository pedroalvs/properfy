import { describe, it, expect } from 'vitest';
import {
  parseCronExpression,
  isValidCronExpression,
  getNextRunTime,
} from '../../../src/modules/report/domain/cron-parser';

describe('parseCronExpression', () => {
  it('should parse a simple daily cron (0 8 * * *)', () => {
    const result = parseCronExpression('0 8 * * *');
    expect(result.minutes).toEqual([0]);
    expect(result.hours).toEqual([8]);
    expect(result.daysOfMonth.length).toBe(31);
    expect(result.months.length).toBe(12);
    expect(result.daysOfWeek.length).toBe(7);
  });

  it('should parse every 15 minutes (*/15 * * * *)', () => {
    const result = parseCronExpression('*/15 * * * *');
    expect(result.minutes).toEqual([0, 15, 30, 45]);
  });

  it('should parse weekly Monday at 9am (0 9 * * 1)', () => {
    const result = parseCronExpression('0 9 * * 1');
    expect(result.minutes).toEqual([0]);
    expect(result.hours).toEqual([9]);
    expect(result.daysOfWeek).toEqual([1]);
  });

  it('should parse monthly first day at midnight (0 0 1 * *)', () => {
    const result = parseCronExpression('0 0 1 * *');
    expect(result.minutes).toEqual([0]);
    expect(result.hours).toEqual([0]);
    expect(result.daysOfMonth).toEqual([1]);
  });

  it('should parse range (0 9-17 * * *)', () => {
    const result = parseCronExpression('0 9-17 * * *');
    expect(result.hours).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it('should parse list (0 8,12,18 * * *)', () => {
    const result = parseCronExpression('0 8,12,18 * * *');
    expect(result.hours).toEqual([8, 12, 18]);
  });

  it('should parse range with step (0 0-23/6 * * *)', () => {
    const result = parseCronExpression('0 0-23/6 * * *');
    expect(result.hours).toEqual([0, 6, 12, 18]);
  });

  it('should throw for expression with wrong number of fields', () => {
    expect(() => parseCronExpression('0 8 *')).toThrow('must have 5 fields');
    expect(() => parseCronExpression('0 8 * * * *')).toThrow('must have 5 fields');
  });

  it('should throw for invalid minute value', () => {
    expect(() => parseCronExpression('60 * * * *')).toThrow();
  });

  it('should throw for invalid hour value', () => {
    expect(() => parseCronExpression('0 25 * * *')).toThrow();
  });

  it('should throw for invalid step', () => {
    expect(() => parseCronExpression('*/0 * * * *')).toThrow();
  });
});

describe('isValidCronExpression', () => {
  it('should return true for valid expressions', () => {
    expect(isValidCronExpression('0 8 * * *')).toBe(true);
    expect(isValidCronExpression('*/15 * * * *')).toBe(true);
    expect(isValidCronExpression('0 9 * * 1')).toBe(true);
    expect(isValidCronExpression('0 0 1 * *')).toBe(true);
  });

  it('should return false for invalid expressions', () => {
    expect(isValidCronExpression('not a cron')).toBe(false);
    expect(isValidCronExpression('60 * * * *')).toBe(false);
    expect(isValidCronExpression('')).toBe(false);
  });
});

describe('getNextRunTime', () => {
  it('should find next run time for daily 8am cron', () => {
    // Use local time — cron parser works in local timezone
    const after = new Date();
    after.setHours(7, 0, 0, 0);
    const next = getNextRunTime('0 8 * * *', after);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(8);
    expect(next!.getMinutes()).toBe(0);
  });

  it('should find next run time for every-15-minutes cron', () => {
    const after = new Date('2026-04-06T10:02:00Z');
    const next = getNextRunTime('*/15 * * * *', after);
    expect(next).not.toBeNull();
    expect(next!.getMinutes()).toBe(15);
  });

  it('should find next Monday for weekly Monday cron', () => {
    // 2026-04-06 is a Monday, so next Monday 9am after 10am would be 2026-04-13
    const after = new Date('2026-04-06T10:00:00Z');
    const next = getNextRunTime('0 9 * * 1', after);
    expect(next).not.toBeNull();
    expect(next!.getDay()).toBe(1); // Monday
  });

  it('should find first of next month for monthly cron', () => {
    const after = new Date('2026-04-15T00:00:00Z');
    const next = getNextRunTime('0 0 1 * *', after);
    expect(next).not.toBeNull();
    expect(next!.getDate()).toBe(1);
    expect(next!.getMonth()).toBe(4); // May (0-indexed)
  });

  it('should return a date after the given time', () => {
    const after = new Date('2026-04-06T08:00:00Z');
    const next = getNextRunTime('0 8 * * *', after);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(after.getTime());
  });
});
