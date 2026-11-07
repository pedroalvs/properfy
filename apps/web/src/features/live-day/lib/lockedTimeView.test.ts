import { describe, it, expect } from 'vitest';
import {
  LOCKED_TIME_PERIODS,
  DEFAULT_LOCKED_TIME_PERIOD,
  lockedTimeRange,
  lockedTimeRangeLabel,
  regionCellLabel,
  formatLockedPercent,
  sortByLocked,
} from './lockedTimeView';

describe('lockedTimeView', () => {
  it('exposes the 7/14/30 presets with 14 as the default', () => {
    expect(LOCKED_TIME_PERIODS).toEqual([7, 14, 30]);
    expect(DEFAULT_LOCKED_TIME_PERIOD).toBe(14);
  });

  describe('lockedTimeRange', () => {
    it('anchors on today and spans periodDays inclusive (14 → today..today+13)', () => {
      expect(lockedTimeRange('2026-11-05', 14)).toEqual({ from: '2026-11-05', to: '2026-11-18' });
    });

    it('spans 7 days (today..today+6)', () => {
      expect(lockedTimeRange('2026-11-05', 7)).toEqual({ from: '2026-11-05', to: '2026-11-11' });
    });

    it('spans 30 days (today..today+29)', () => {
      expect(lockedTimeRange('2026-11-05', 30)).toEqual({ from: '2026-11-05', to: '2026-12-04' });
    });

    it('anchors on today even when a different (past) day is passed as today unchanged', () => {
      // The caller always passes data.today (L-F05-09); the helper never reads any other date.
      expect(lockedTimeRange('2026-11-05', 14).from).toBe('2026-11-05');
    });
  });

  describe('lockedTimeRangeLabel', () => {
    it('renders "d MMM – d MMM" without a timezone', () => {
      expect(lockedTimeRangeLabel('2026-11-05', '2026-11-18')).toBe('5 Nov – 18 Nov');
    });

    it('crosses a month boundary', () => {
      expect(lockedTimeRangeLabel('2026-11-05', '2026-12-04')).toBe('5 Nov – 4 Dec');
    });
  });

  describe('regionCellLabel', () => {
    it('appends the owning agency for an agency-owned region', () => {
      expect(regionCellLabel({ regionId: 'r1', regionName: 'North', agencyName: 'Ray White' })).toBe(
        'North · Ray White',
      );
    });

    it('labels a global region (agencyName null, regionId present) as Platform', () => {
      expect(regionCellLabel({ regionId: 'r1', regionName: 'North', agencyName: null })).toBe('North · Platform');
    });

    it('gives "No region" (regionId null) no suffix', () => {
      expect(regionCellLabel({ regionId: null, regionName: 'No region', agencyName: null })).toBe('No region');
    });
  });

  describe('formatLockedPercent', () => {
    it('renders one decimal place', () => {
      expect(formatLockedPercent(66.66667)).toBe('66.7%');
      expect(formatLockedPercent(100)).toBe('100.0%');
      expect(formatLockedPercent(0)).toBe('0.0%');
    });

    it('renders null as an em dash', () => {
      expect(formatLockedPercent(null)).toBe('—');
    });
  });

  describe('sortByLocked', () => {
    const rows = [
      { regionId: 'a', percent: 50 },
      { regionId: 'b', percent: 10 },
      { regionId: null, percent: 90 }, // "No region" — must stay last
      { regionId: 'c', percent: 70 },
    ];
    const pinned = (r: { regionId: string | null }) => r.regionId === null;

    it('sorts ascending by percent and keeps the pinned row last', () => {
      const out = sortByLocked(rows, 'asc', pinned).map((r) => r.regionId);
      expect(out).toEqual(['b', 'a', 'c', null]);
    });

    it('sorts descending by percent and keeps the pinned row last', () => {
      const out = sortByLocked(rows, 'desc', pinned).map((r) => r.regionId);
      expect(out).toEqual(['c', 'a', 'b', null]);
    });

    it('keeps source order of non-pinned rows when dir is null, pinned still last', () => {
      const out = sortByLocked(rows, null, pinned).map((r) => r.regionId);
      expect(out).toEqual(['a', 'b', 'c', null]);
    });

    it('sorts null percents last regardless of direction', () => {
      const withNull = [
        { regionId: 'a', percent: 50 },
        { regionId: 'b', percent: null },
        { regionId: 'c', percent: 10 },
      ];
      expect(sortByLocked(withNull, 'asc').map((r) => r.regionId)).toEqual(['c', 'a', 'b']);
      expect(sortByLocked(withNull, 'desc').map((r) => r.regionId)).toEqual(['a', 'c', 'b']);
    });

    it('works without a pinned predicate (by-agency table)', () => {
      const agencies = [
        { tenantId: 't1', percent: 30 },
        { tenantId: 't2', percent: 80 },
      ];
      expect(sortByLocked(agencies, 'desc').map((r) => r.tenantId)).toEqual(['t2', 't1']);
    });
  });
});
