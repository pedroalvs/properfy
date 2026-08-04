import { useCallback, useMemo } from 'react';
import { PLATFORM_TIMEZONE, addCivilDays, todayInTzDateString } from '@properfy/shared';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';

/** Presets the segmented control offers, plus the escape hatch to explicit dates. */
export const PERIOD_PRESETS = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-30', label: 'Last 30 days' },
  { value: 'this-quarter', label: 'This quarter' },
  { value: 'custom', label: 'Custom' },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]['value'];

export const ANALYTICS_FILTER_SCHEMA = {
  preset: { type: 'string' as const, default: 'this-month' },
  startDate: { type: 'string' as const, default: '' },
  endDate: { type: 'string' as const, default: '' },
};

/**
 * Resolves a preset to a civil-date range. The hook passes "today" in the
 * user's effective timezone; the pure default stays `PLATFORM_TIMEZONE`.
 *
 * All arithmetic is civil-date **string** math. Building a `Date` from local
 * calendar components and then reading `toISOString()` off it mixes two clocks:
 * local midnight in Sydney is the previous day in UTC, so every boundary lands
 * one day early — `this-month` on 15 July resolves to 30 June → 14 July. The
 * bug is invisible on a UTC or Americas machine, which is precisely why it
 * survived the first round of tests.
 *
 * @param today Civil date (YYYY-MM-DD) to resolve against; defaults to today in
 *   the platform timezone. A string, not a `Date`, so there is no instant left
 *   to misinterpret.
 */
export function resolvePreset(
  preset: PeriodPreset,
  today: string = todayInTzDateString(PLATFORM_TIMEZONE),
): { startDate: string; endDate: string } {
  const endDate = today;

  if (preset === 'last-30') {
    // Inclusive of both ends: 30 days total, so step back 29.
    return { startDate: addCivilDays(today, -29), endDate };
  }

  if (preset === 'this-quarter') {
    const month = Number(today.slice(5, 7));
    const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return {
      startDate: `${today.slice(0, 4)}-${String(quarterStartMonth).padStart(2, '0')}-01`,
      endDate,
    };
  }

  // 'this-month' — and the fallback for 'custom' before dates are entered.
  return { startDate: `${today.slice(0, 7)}-01`, endDate };
}

export interface AnalyticsPeriod {
  preset: PeriodPreset;
  startDate: string;
  endDate: string;
  setPreset: (preset: PeriodPreset) => void;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  /** False while a custom range is half-entered or inverted — queries stay parked. */
  isValid: boolean;
}

/**
 * Period state for the Analytics screen, synced to the URL so a range can be
 * shared or bookmarked the way the list and board filters are.
 */
export function useAnalyticsPeriod(): AnalyticsPeriod {
  const [filters, setFilter] = useUrlFilters(ANALYTICS_FILTER_SCHEMA);
  const effectiveTimezone = useEffectiveTimezone();
  const preset = filters.preset as PeriodPreset;

  const resolved = useMemo(() => {
    if (preset === 'custom') {
      return { startDate: filters.startDate, endDate: filters.endDate };
    }
    return resolvePreset(preset, todayInTzDateString(effectiveTimezone));
  }, [preset, filters.startDate, filters.endDate, effectiveTimezone]);

  const setPreset = useCallback(
    (next: PeriodPreset) => {
      // Seed the custom inputs from whatever was on screen, so switching to
      // Custom starts from the range the operator was already looking at.
      if (next === 'custom') {
        setFilter('startDate', resolved.startDate);
        setFilter('endDate', resolved.endDate);
      }
      setFilter('preset', next);
    },
    [setFilter, resolved.startDate, resolved.endDate],
  );

  const setStartDate = useCallback((value: string) => setFilter('startDate', value), [setFilter]);
  const setEndDate = useCallback((value: string) => setFilter('endDate', value), [setFilter]);

  return {
    preset,
    startDate: resolved.startDate,
    endDate: resolved.endDate,
    setPreset,
    setStartDate,
    setEndDate,
    isValid: Boolean(resolved.startDate && resolved.endDate && resolved.startDate <= resolved.endDate),
  };
}
