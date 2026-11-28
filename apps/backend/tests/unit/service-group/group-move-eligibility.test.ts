import { describe, it, expect } from 'vitest';
import {
  isSameDayGroupStillMovable,
  moveTargetLowerBoundDate,
  isCurrentDayGroup,
} from '../../../src/modules/service-group/domain/group-move-eligibility';

// TZ is pinned away from Sydney by the test runner; these assertions must hold
// regardless of the host timezone. Sydney is AEST (UTC+10) in May, AEDT (UTC+11)
// in January, so 18:50 Sydney = 08:50 UTC (May) / 07:50 UTC (January).

describe('isSameDayGroupStillMovable (18:50 Sydney cutoff)', () => {
  it('is true before 18:50 Sydney (AEST / May)', () => {
    expect(isSameDayGroupStillMovable(new Date('2026-05-01T08:00:00Z'))).toBe(true); // 18:00 Sydney
  });

  it('is false at exactly 18:50 Sydney', () => {
    expect(isSameDayGroupStillMovable(new Date('2026-05-01T08:50:00Z'))).toBe(false);
  });

  it('is false after 18:50 Sydney', () => {
    expect(isSameDayGroupStillMovable(new Date('2026-05-01T09:00:00Z'))).toBe(false); // 19:00 Sydney
  });

  it('handles daylight saving (AEDT / January, 18:50 Sydney = 07:50 UTC)', () => {
    expect(isSameDayGroupStillMovable(new Date('2026-01-15T07:00:00Z'))).toBe(true); // 18:00 Sydney
    expect(isSameDayGroupStillMovable(new Date('2026-01-15T08:00:00Z'))).toBe(false); // 19:00 Sydney
  });
});

describe('moveTargetLowerBoundDate', () => {
  it('returns today (Sydney) before the cutoff', () => {
    expect(moveTargetLowerBoundDate(new Date('2026-05-01T08:00:00Z'))).toBe('2026-05-01');
  });

  it('returns tomorrow (Sydney) once the cutoff has passed', () => {
    expect(moveTargetLowerBoundDate(new Date('2026-05-01T09:00:00Z'))).toBe('2026-05-02');
  });

  it('uses the Sydney civil date, not UTC, in the rollover window', () => {
    // 2026-05-01T20:00:00Z is 2026-05-02 06:00 Sydney — a fresh day before the cutoff.
    expect(moveTargetLowerBoundDate(new Date('2026-05-01T20:00:00Z'))).toBe('2026-05-02');
  });
});

describe('isCurrentDayGroup', () => {
  // @db.Date values come back as UTC-midnight instants of the civil date.
  it('is true when the group date equals today in Sydney', () => {
    expect(
      isCurrentDayGroup(new Date('2026-05-01T00:00:00Z'), new Date('2026-05-01T08:00:00Z')),
    ).toBe(true);
  });

  it('is false for a future-dated group', () => {
    expect(
      isCurrentDayGroup(new Date('2026-05-02T00:00:00Z'), new Date('2026-05-01T08:00:00Z')),
    ).toBe(false);
  });

  it('uses the Sydney civil date in the UTC rollover window', () => {
    // now = 2026-04-30T20:00:00Z is 2026-05-01 06:00 Sydney.
    expect(
      isCurrentDayGroup(new Date('2026-05-01T00:00:00Z'), new Date('2026-04-30T20:00:00Z')),
    ).toBe(true);
  });
});
