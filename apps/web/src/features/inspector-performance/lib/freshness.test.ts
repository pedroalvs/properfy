import { describe, it, expect } from 'vitest';
import { resolveFreshness } from './freshness';

// sydneyHour() forces the Sydney timezone via Intl, so these assertions hold
// regardless of the process TZ (memory feedback_tz_dependent_test_must_pin_away).
// December = AEDT (+11): Sydney 09:00 on the 2nd = 2026-12-01T22:00Z, 04:30 = 2026-12-01T17:30Z.
const NINE_AM_SYD = new Date('2026-12-01T22:00:00Z');
const HALF_FOUR_AM_SYD = new Date('2026-12-01T17:30:00Z');
const FIVE_AM_SYD = new Date('2026-12-01T18:00:00Z');

const COMPUTED = '2026-12-01T17:15:00.000Z'; // 4:15 am Sydney Dec 2
const CHANGED = '2026-12-01T23:00:00.000Z'; // 10:00 am Sydney Dec 2

describe('resolveFreshness — stale banner', () => {
  it('shows after 05:00 Sydney when stale', () => {
    const state = resolveFreshness({
      isStale: true,
      snapshotDate: '2026-12-01',
      settingsUpdatedAt: null,
      computedAt: COMPUTED,
      now: NINE_AM_SYD,
    });
    expect(state.stale).toEqual({ snapshotDate: '2026-12-01' });
  });

  it('is suppressed before 05:00 Sydney', () => {
    const state = resolveFreshness({
      isStale: true,
      snapshotDate: '2026-12-01',
      settingsUpdatedAt: null,
      computedAt: COMPUTED,
      now: HALF_FOUR_AM_SYD,
    });
    expect(state.stale).toBeNull();
  });

  it('shows from exactly 05:00 Sydney', () => {
    const state = resolveFreshness({
      isStale: true,
      snapshotDate: '2026-12-01',
      settingsUpdatedAt: null,
      computedAt: COMPUTED,
      now: FIVE_AM_SYD,
    });
    expect(state.stale).not.toBeNull();
  });

  it('is absent when not stale', () => {
    const state = resolveFreshness({
      isStale: false,
      snapshotDate: '2026-12-01',
      settingsUpdatedAt: null,
      computedAt: COMPUTED,
      now: NINE_AM_SYD,
    });
    expect(state.stale).toBeNull();
  });
});

describe('resolveFreshness — recompute banner', () => {
  it('is pending (not overdue) within 15 minutes of the change', () => {
    const state = resolveFreshness({
      isStale: false,
      snapshotDate: '2026-12-01',
      settingsUpdatedAt: CHANGED,
      computedAt: COMPUTED,
      now: new Date('2026-12-01T23:05:00.000Z'), // 5 min after
    });
    expect(state.recompute).toEqual({ changedAt: CHANGED, overdue: false });
  });

  it('is overdue at or beyond 15 minutes', () => {
    const state = resolveFreshness({
      isStale: false,
      snapshotDate: '2026-12-01',
      settingsUpdatedAt: CHANGED,
      computedAt: COMPUTED,
      now: new Date('2026-12-01T23:20:00.000Z'), // 20 min after
    });
    expect(state.recompute).toEqual({ changedAt: CHANGED, overdue: true });
  });

  it('is absent when the recompute already ran (computedAt >= settingsUpdatedAt)', () => {
    const state = resolveFreshness({
      isStale: false,
      snapshotDate: '2026-12-01',
      settingsUpdatedAt: CHANGED,
      computedAt: '2026-12-01T23:01:00.000Z', // after the change
      now: new Date('2026-12-01T23:30:00.000Z'),
    });
    expect(state.recompute).toBeNull();
  });
});

describe('resolveFreshness — both', () => {
  it('can show both banners at once', () => {
    const state = resolveFreshness({
      isStale: true,
      snapshotDate: '2026-12-01',
      settingsUpdatedAt: CHANGED,
      computedAt: COMPUTED,
      now: new Date('2026-12-01T23:20:00.000Z'),
    });
    expect(state.stale).not.toBeNull();
    expect(state.recompute).not.toBeNull();
  });
});
