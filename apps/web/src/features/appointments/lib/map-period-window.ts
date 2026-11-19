import {
  addCivilDays,
  isValidIanaTimezone,
  tenantSettingsSchema,
  MAP_WINDOW_DAYS_DEFAULT,
  PLATFORM_TIMEZONE,
} from '@properfy/shared';

/** A civil-date window [from, to] (inclusive), both `YYYY-MM-DD`. */
export interface WindowRange {
  from: string;
  to: string;
}

/**
 * Tolerant read of the per-agency `mapWindowDays`. Returns the stored value when it passes the
 * shared schema (integer 1–90), else the platform default — covering absent, null, 0, 91, 7.5,
 * a string, or a legacy invalid value that slipped through `.passthrough()`.
 */
export function resolveMapWindowDays(settingsJson: unknown): number {
  const raw = (settingsJson as { mapWindowDays?: unknown } | null | undefined)?.mapWindowDays;
  const result = tenantSettingsSchema.shape.mapWindowDays.safeParse(raw);
  return result.success && typeof result.data === 'number' ? result.data : MAP_WINDOW_DAYS_DEFAULT;
}

/** The agency timezone when it is a valid IANA id, else the platform timezone. Never `user.timezone`. */
export function resolveWindowTimezone(tz?: string | null): string {
  return tz && isValidIanaTimezone(tz) ? tz : PLATFORM_TIMEZONE;
}

/**
 * The default window: today through today + N civil days (inclusive). N counts the days AFTER
 * today, so the window spans N+1 civil days (`Today + {N} days`).
 */
export function computeWindowRange(windowDays: number, today: string): WindowRange {
  return { from: today, to: addCivilDays(today, windowDays) };
}

/**
 * Clamp a requested `{dateFrom, dateTo}` into the window by intersecting the two intervals
 * (an empty `''` endpoint means "the window edge"). When the requested range does not overlap
 * the window, or is inverted, the whole window is returned.
 */
export function clampRangeToWindow(
  range: { dateFrom: string; dateTo: string },
  window: WindowRange,
): { dateFrom: string; dateTo: string } {
  const reqFrom = range.dateFrom || window.from;
  const reqTo = range.dateTo || window.to;
  const lo = reqFrom > window.from ? reqFrom : window.from; // max(reqFrom, from)
  const hi = reqTo < window.to ? reqTo : window.to; // min(reqTo, to)
  if (lo > hi) return { dateFrom: window.from, dateTo: window.to };
  return { dateFrom: lo, dateTo: hi };
}

/** UI label for the window, e.g. `Today + 14 days` / `Today + 1 day`. */
export function formatWindowLabel(windowDays: number): string {
  return `Today + ${windowDays} day${windowDays === 1 ? '' : 's'}`;
}
