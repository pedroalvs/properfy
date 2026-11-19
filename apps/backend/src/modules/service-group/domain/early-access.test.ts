import { describe, it, expect, vi } from 'vitest';
import {
  resolveEarlyAccessParams,
  isGroupInEarlyAccess,
  formatOpensAt,
  offerOpensAt,
} from './early-access';

// The display helpers pin PLATFORM_TIMEZONE (Australia/Sydney) via explicit
// Intl timeZone, so results do not depend on the process TZ. We still assert the
// exact strings here; the TZ-independence is proven by the helpers' own tests and
// re-asserted below by the identical expectations regardless of host TZ.

describe('resolveEarlyAccessParams', () => {
  const base = {
    hours: 12,
    minScore: 85,
    latestSnapshotDate: '2026-11-10',
    now: new Date('2026-11-10T10:00:00.000Z'),
    todaySydney: '2026-11-10',
    enabledAt: '2026-11-01T00:00:00.000Z',
  };

  it('returns null when disabled', () => {
    expect(
      resolveEarlyAccessParams({ ...base, enabled: false, viewerQualifies: false }),
    ).toBeNull();
  });

  it('returns null when the viewer already qualifies', () => {
    expect(
      resolveEarlyAccessParams({ ...base, enabled: true, viewerQualifies: true }),
    ).toBeNull();
  });

  it('returns null when there is no snapshot (nobody can qualify)', () => {
    expect(
      resolveEarlyAccessParams({
        ...base,
        enabled: true,
        viewerQualifies: false,
        latestSnapshotDate: null,
      }),
    ).toBeNull();
  });

  it('returns the window params when the viewer does not qualify', () => {
    const params = resolveEarlyAccessParams({
      ...base,
      enabled: true,
      viewerQualifies: false,
    });
    expect(params).toEqual({
      hours: 12,
      cutoffUtc: '2026-11-09T22:00:00.000',
      enabledAtUtc: '2026-11-01T00:00:00.000',
      protectedFrom: '2026-11-12',
      minScore: 85,
      latestSnapshotDate: '2026-11-10',
    });
  });

  it('(L-F08-08) returns null and warns when enabled but enabledAt is null', () => {
    const logger = { warn: vi.fn() };
    expect(
      resolveEarlyAccessParams(
        { ...base, enabled: true, viewerQualifies: false, enabledAt: null },
        logger,
      ),
    ).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(Object),
      'marketplace.early_access_missing_enabled_at',
    );
  });
});

describe('isGroupInEarlyAccess', () => {
  const params = {
    hours: 12,
    cutoffUtc: '2026-11-09T22:00:00.000',
    enabledAtUtc: '2026-11-01T00:00:00.000',
    protectedFrom: '2026-11-12',
    minScore: 85,
    latestSnapshotDate: '2026-11-10',
  };
  const inWindow = {
    publishedAt: new Date('2026-11-10T09:00:00.000Z'), // after cutoff, after enabledAt
    scheduledDate: '2026-11-13', // >= protectedFrom
    hasQualifiedEligible: true,
  };

  it('is false when params is null', () => {
    expect(isGroupInEarlyAccess(inWindow, null)).toBe(false);
  });

  it('is false when publishedAt is null', () => {
    expect(isGroupInEarlyAccess({ ...inWindow, publishedAt: null }, params)).toBe(false);
  });

  it('is false when publishedAt is at/before the cutoff', () => {
    expect(
      isGroupInEarlyAccess(
        { ...inWindow, publishedAt: new Date('2026-11-09T22:00:00.000Z') },
        params,
      ),
    ).toBe(false);
  });

  it('(L-F08-08) is false when published before enabledAt', () => {
    expect(
      isGroupInEarlyAccess(
        { ...inWindow, publishedAt: new Date('2026-10-31T23:59:00.000Z') },
        params,
      ),
    ).toBe(false);
  });

  it('is false for a group scheduled today or D+1 (before protectedFrom)', () => {
    expect(isGroupInEarlyAccess({ ...inWindow, scheduledDate: '2026-11-11' }, params)).toBe(false);
  });

  it('is false when there is no qualified-eligible inspector', () => {
    expect(isGroupInEarlyAccess({ ...inWindow, hasQualifiedEligible: false }, params)).toBe(false);
  });

  it('is true when all conditions hold', () => {
    expect(isGroupInEarlyAccess(inWindow, params)).toBe(true);
  });
});

describe('offerOpensAt', () => {
  it('is publishedAt + H hours', () => {
    const params = {
      hours: 12,
      cutoffUtc: '2026-11-09T22:00:00.000',
      enabledAtUtc: '2026-11-01T00:00:00.000',
      protectedFrom: '2026-11-12',
      minScore: 85,
      latestSnapshotDate: '2026-11-10',
    };
    expect(offerOpensAt(new Date('2026-11-10T10:00:00.000Z'), params).toISOString()).toBe(
      '2026-11-10T22:00:00.000Z',
    );
  });
});

describe('formatOpensAt', () => {
  it('renders the Sydney day and time (AEDT)', () => {
    // 11:00Z + ... example: 2026-11-10T11:00:00Z = 22:00 AEDT same day
    expect(formatOpensAt(new Date('2026-11-10T11:00:00.000Z'))).toBe(
      'This offer opens to all inspectors on Tue 10 Nov at 10:00 pm.',
    );
    // 2026-11-10T22:00:00Z = 09:00 AEDT the next civil day
    expect(formatOpensAt(new Date('2026-11-10T22:00:00.000Z'))).toBe(
      'This offer opens to all inspectors on Wed 11 Nov at 9:00 am.',
    );
  });
});
