import { useCallback, useMemo } from 'react';
import { addCivilDays, mondayOf, todayInTzDateString } from '@properfy/shared';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';

export const WORKLOAD_FILTER_SCHEMA = {
  week: { type: 'string' as const, default: '' },
};

const DAYS_IN_WEEK = 7;
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a real calendar date. The regex alone accepts `2026-02-31`,
 * which `Date` silently rolls over into March.
 */
function isCivilDate(value: string): boolean {
  if (!CIVIL_DATE.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

export interface WorkloadWeek {
  /** Monday of the selected week, and the value that travels in the URL. */
  weekStart: string;
  weekEnd: string;
  /** Monday through Sunday, for the matrix column headers. */
  days: string[];
  isCurrentWeek: boolean;
  goPrev: () => void;
  goNext: () => void;
  goThisWeek: () => void;
  /** Accepts any civil date and snaps it to that week's Monday. */
  setWeek: (value: string) => void;
}

/**
 * Selected-week state for the Inspector Workload screen, synced to the URL so a
 * week can be shared or bookmarked.
 *
 * Every date computation here is civil-date **string** math. Deriving a week
 * from `new Date(y, m, d)` reads the browser's timezone rather than Sydney's,
 * so an operator in another timezone would see a week offset by a day — the
 * same class of bug `resolvePreset` documents on the Analytics screen.
 *
 * The URL only ever holds a Monday, because `setWeek` snaps before writing. The
 * API rejects a non-Monday `weekStart`, so that snapping is what keeps a
 * hand-edited URL from turning into a 400.
 */
export function useWorkloadWeek(): WorkloadWeek {
  const [filters, setFilter] = useUrlFilters(WORKLOAD_FILTER_SCHEMA);
  const effectiveTimezone = useEffectiveTimezone();

  const currentWeek = mondayOf(todayInTzDateString(effectiveTimezone));

  // A missing, malformed or impossible `week` param falls back to this week
  // rather than rendering an error: the screen has a sensible default and a
  // broken bookmark should not be a dead end.
  const weekStart = isCivilDate(filters.week) ? mondayOf(filters.week) : currentWeek;

  const days = useMemo(
    () => Array.from({ length: DAYS_IN_WEEK }, (_, i) => addCivilDays(weekStart, i)),
    [weekStart],
  );

  const setWeek = useCallback(
    (value: string) => {
      if (!isCivilDate(value)) return;
      setFilter('week', mondayOf(value));
    },
    [setFilter],
  );

  const goPrev = useCallback(
    () => setFilter('week', addCivilDays(weekStart, -DAYS_IN_WEEK)),
    [setFilter, weekStart],
  );
  const goNext = useCallback(
    () => setFilter('week', addCivilDays(weekStart, DAYS_IN_WEEK)),
    [setFilter, weekStart],
  );
  const goThisWeek = useCallback(() => setFilter('week', currentWeek), [setFilter, currentWeek]);

  // Memoized: an unmemoized derived return has caused a render loop here before
  // (apps/web/CLAUDE.md §13.11).
  return useMemo(
    () => ({
      weekStart,
      weekEnd: days[DAYS_IN_WEEK - 1]!,
      days,
      isCurrentWeek: weekStart === currentWeek,
      goPrev,
      goNext,
      goThisWeek,
      setWeek,
    }),
    [weekStart, days, currentWeek, goPrev, goNext, goThisWeek, setWeek],
  );
}
