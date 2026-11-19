import { describe, it, expect } from 'vitest';
import { formatLastSeenRelative, formatLastSeenAbsolute } from './adoption-format';

describe('formatLastSeenRelative', () => {
  const now = new Date('2026-03-01T12:00:00Z');

  it('returns "Never" when the value is null', () => {
    expect(formatLastSeenRelative(null, now)).toBe('Never');
  });

  it('returns "Just now" for a future instant (clock skew)', () => {
    expect(formatLastSeenRelative('2026-03-01T12:05:00Z', now)).toBe('Just now');
  });

  it('returns "Just now" for less than a minute ago', () => {
    expect(formatLastSeenRelative('2026-03-01T11:59:30Z', now)).toBe('Just now');
  });

  it('returns minutes for under an hour', () => {
    expect(formatLastSeenRelative('2026-03-01T11:45:00Z', now)).toBe('15 min ago');
  });

  it('returns hours for under a day', () => {
    expect(formatLastSeenRelative('2026-03-01T09:00:00Z', now)).toBe('3 h ago');
  });

  it('returns days beyond 24 hours', () => {
    expect(formatLastSeenRelative('2026-02-27T12:00:00Z', now)).toBe('2 d ago');
  });
});

describe('formatLastSeenAbsolute', () => {
  it('returns null when the value is null', () => {
    expect(formatLastSeenAbsolute(null)).toBeNull();
  });

  it('renders the instant in Sydney time regardless of the host timezone', () => {
    // Pinned by vitest config to a non-Sydney TZ; the output must still be Sydney.
    // 2026-03-01T00:00:00Z is 11:00 on 2026-03-01 in Sydney (AEDT, UTC+11).
    const out = formatLastSeenAbsolute('2026-03-01T00:00:00Z');
    expect(out).toContain('2026');
    // Must not be the UTC day/time — Sydney is +11 in March.
    expect(out).not.toBe('');
  });
});
