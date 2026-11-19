import { describe, it, expect } from 'vitest';
import { formatRelativeNoticeDate, formatFullNoticeDate } from '../format-relative';

const TZ = 'Australia/Sydney';
// now = 2026-11-10 10:00 Sydney (AEDT, +11)
const NOW = new Date('2026-11-09T23:00:00Z');

describe('formatRelativeNoticeDate', () => {
  it('shows hours ago for earlier today', () => {
    // 2026-11-10 08:00 Sydney → 2h ago
    expect(formatRelativeNoticeDate('2026-11-09T21:00:00Z', NOW, TZ)).toBe('2h ago');
  });

  it('shows minutes ago under an hour', () => {
    // 2026-11-10 09:30 Sydney → 30m ago
    expect(formatRelativeNoticeDate('2026-11-09T22:30:00Z', NOW, TZ)).toBe('30m ago');
  });

  it('shows "Just now" under a minute', () => {
    expect(formatRelativeNoticeDate('2026-11-09T22:59:40Z', NOW, TZ)).toBe('Just now');
  });

  it('shows "Yesterday" for the previous civil day', () => {
    // 2026-11-09 09:00 Sydney → yesterday
    expect(formatRelativeNoticeDate('2026-11-08T22:00:00Z', NOW, TZ)).toBe('Yesterday');
  });

  it('shows an absolute day-month above 6 days', () => {
    // 2026-11-03 09:00 Sydney → 7 days ago → "3 Nov"
    expect(formatRelativeNoticeDate('2026-11-02T22:00:00Z', NOW, TZ)).toBe('3 Nov');
  });
});

describe('formatFullNoticeDate', () => {
  it('formats an instant in the inspector timezone', () => {
    expect(formatFullNoticeDate('2026-11-09T22:30:00Z', TZ)).toBe('Tue 10 Nov, 9:30 am');
  });

  it('returns empty string for a missing value', () => {
    expect(formatFullNoticeDate('', TZ)).toBe('');
  });
});
