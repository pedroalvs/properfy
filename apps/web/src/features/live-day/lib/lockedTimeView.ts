import { addCivilDays } from '@properfy/shared';

/**
 * Period presets for the "Locked time" tab (01.13). These are feature-local
 * constants, unrelated to the per-agency `mapWindowDays` of F00 (L-F05-09).
 */
export const LOCKED_TIME_PERIODS = [7, 14, 30] as const;
export type LockedTimePeriod = (typeof LOCKED_TIME_PERIODS)[number];
export const DEFAULT_LOCKED_TIME_PERIOD: LockedTimePeriod = 14;

/**
 * The civil-date range for a period, anchored on `today` (the Live Day server
 * `data.today`, L-F05-09). Inclusive: 14 days → `today .. today + 13`.
 */
export function lockedTimeRange(today: string, periodDays: number): { from: string; to: string } {
  return { from: today, to: addCivilDays(today, periodDays - 1) };
}

// English-only, timezone-free month abbreviations. Civil dates are calendar days
// with no instant and no timezone, and the app is English-only (web CLAUDE.md
// §13.7), so a fixed table is deterministic across every Node/ICU build — unlike
// Intl, which has drifted between Node versions (project_icu_locale_default_date_format_node_version_drift).
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats a civil date (`YYYY-MM-DD`) as `d MMM` (e.g. "5 Nov"). No timezone. */
export function formatCivilDayMonth(civilDate: string): string {
  const [, month, day] = civilDate.split('-');
  const m = Number(month);
  const d = Number(day);
  if (!m || !d || m < 1 || m > 12) return civilDate;
  return `${d} ${MONTH_ABBR[m - 1]}`;
}

/** The subtitle range label, e.g. "5 Nov – 18 Nov" (en-dash, no timezone). */
export function lockedTimeRangeLabel(from: string, to: string): string {
  return `${formatCivilDayMonth(from)} – ${formatCivilDayMonth(to)}`;
}

/**
 * The "Region" cell label (L-F05-13):
 * - agency-owned region → "{regionName} · {agencyName}"
 * - global region (agencyName null, regionId present) → "{regionName} · Platform"
 * - "No region" (regionId null) → "{regionName}" with no suffix
 */
export function regionCellLabel(row: {
  regionId: string | null;
  regionName: string;
  agencyName: string | null;
}): string {
  if (row.regionId === null) return row.regionName;
  if (row.agencyName) return `${row.regionName} · ${row.agencyName}`;
  return `${row.regionName} · Platform`;
}

/** Locked share as "66.7%" (one decimal), or "—" when there is nothing to confirm. */
export function formatLockedPercent(percent: number | null): string {
  return percent === null ? '—' : `${percent.toFixed(1)}%`;
}

/**
 * Sort rows by locked `percent` for the table. `dir` null keeps the source order
 * of the non-pinned rows (the backend already orders them). A row matching
 * `pinnedLast` (the "No region" row) always sorts last, in every direction
 * (L-F05-13). Null percents sort last among the non-pinned rows.
 */
export function sortByLocked<T extends { percent: number | null }>(
  rows: T[],
  dir: 'asc' | 'desc' | null,
  pinnedLast?: (row: T) => boolean,
): T[] {
  const pinned = pinnedLast ? rows.filter(pinnedLast) : [];
  const rest = pinnedLast ? rows.filter((r) => !pinnedLast(r)) : [...rows];
  if (dir) {
    rest.sort((a, b) => {
      if (a.percent == null && b.percent == null) return 0;
      if (a.percent == null) return 1; // nulls last
      if (b.percent == null) return -1;
      return dir === 'asc' ? a.percent - b.percent : b.percent - a.percent;
    });
  }
  return [...rest, ...pinned];
}
