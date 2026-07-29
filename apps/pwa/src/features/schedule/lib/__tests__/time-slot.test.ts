import { describe, it, expect } from 'vitest';
import { formatTimeWindow, parseScheduleDate } from '../time-slot';

describe('parseScheduleDate', () => {
  it('parses a bare calendar day', () => {
    expect(parseScheduleDate('2026-07-28').getDate()).toBe(28);
  });

  it('tolerates a legacy full-ISO value from a stale service-worker cache', () => {
    // The SW caches /v1/inspector/schedule for 24h, so after an update an
    // offline device can still be served a pre-contract body. Concatenating
    // 'T12:00:00' onto that produced an Invalid Date and the schedule headers
    // rendered "Invalid Date".
    const parsed = parseScheduleDate('2026-07-28T00:00:00.000Z');
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(parsed.getDate()).toBe(28);
    expect(parsed.getMonth()).toBe(6);
  });
});

describe('formatTimeWindow', () => {
  it('joins bare HH:mm start and end with an en-dash', () => {
    expect(formatTimeWindow('09:00', '11:00')).toBe('9:00 am – 11:00 am');
  });
});
