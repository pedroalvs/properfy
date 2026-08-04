import { useCallback, useMemo } from 'react';
import { useUrlFilters } from '@/hooks/useUrlFilters';

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

function toCivilDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolves a preset to a civil-date range.
 *
 * Uses the browser's local calendar, which for this product is Sydney — the
 * platform is single-timezone and operators work in it. The server re-resolves
 * the same strings against `PLATFORM_TIMEZONE`, so the boundary that counts is
 * always the server's.
 */
export function resolvePreset(preset: PeriodPreset, today: Date = new Date()): { startDate: string; endDate: string } {
  const endDate = toCivilDate(today);

  if (preset === 'last-30') {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    return { startDate: toCivilDate(start), endDate };
  }

  if (preset === 'this-quarter') {
    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
    return {
      startDate: toCivilDate(new Date(today.getFullYear(), quarterStartMonth, 1)),
      endDate,
    };
  }

  // 'this-month' — and the fallback for 'custom' before dates are entered.
  return { startDate: toCivilDate(new Date(today.getFullYear(), today.getMonth(), 1)), endDate };
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
  const preset = filters.preset as PeriodPreset;

  const resolved = useMemo(() => {
    if (preset === 'custom') {
      return { startDate: filters.startDate, endDate: filters.endDate };
    }
    return resolvePreset(preset);
  }, [preset, filters.startDate, filters.endDate]);

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
