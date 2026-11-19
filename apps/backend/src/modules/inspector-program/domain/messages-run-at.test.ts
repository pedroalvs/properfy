import { describe, expect, it } from 'vitest';
import { messagesRunAt } from './messages-run-at';

// Uses explicit PLATFORM_TIMEZONE via Intl, so results are absolute UTC instants
// regardless of the process TZ (the suite runs pinned to America/Los_Angeles).
describe('messagesRunAt', () => {
  it('returns 08:00 Sydney (AEDT) for a 04:45 run', () => {
    // 2026-11-08T17:45:00Z = 2026-11-09 04:45 AEDT → 08:00 AEDT = 2026-11-08T21:00:00Z
    expect(messagesRunAt(new Date('2026-11-08T17:45:00.000Z')).toISOString()).toBe('2026-11-08T21:00:00.000Z');
  });

  it('returns 08:00 Sydney (AEST) across DST', () => {
    // 2026-07-05T18:45:00Z = 2026-07-06 04:45 AEST → 08:00 AEST = 2026-07-05T22:00:00Z
    expect(messagesRunAt(new Date('2026-07-05T18:45:00.000Z')).toISOString()).toBe('2026-07-05T22:00:00.000Z');
  });

  it('returns now when 08:00 Sydney has already passed', () => {
    // 2026-11-08T22:30:00Z = 09:30 Sydney → already past 08:00 → now
    const now = new Date('2026-11-08T22:30:00.000Z');
    expect(messagesRunAt(now).toISOString()).toBe(now.toISOString());
  });
});
