import { PLATFORM_TIMEZONE } from '@properfy/shared';

/**
 * Date formatting for the Announcements inbox. `publishedAt` is a UTC instant;
 * civil-day comparisons ("Yesterday", the absolute "3 Nov" fallback) are made in
 * the inspector's effective timezone, so these take the timezone explicitly
 * rather than reading the browser's.
 */

function civilParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Whole-day difference between two civil dates (a - b) in the given timezone. */
function civilDayDiff(a: Date, b: Date, timeZone: string): number {
  const pa = civilParts(a, timeZone);
  const pb = civilParts(b, timeZone);
  const da = Date.UTC(pa.year, pa.month - 1, pa.day);
  const db = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((da - db) / 86_400_000);
}

export function formatRelativeNoticeDate(
  iso: string | null | undefined,
  now: Date = new Date(),
  timeZone: string = PLATFORM_TIMEZONE,
): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const dayDiff = civilDayDiff(now, date, timeZone);
  if (dayDiff === 0) return `${Math.floor(diffMin / 60)}h ago`;
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff <= 6) return `${dayDiff}d ago`;

  // Older than a week: an absolute "D Mon" (e.g. "3 Nov") in the inspector tz.
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    day: 'numeric',
    month: 'short',
  }).formatToParts(date);
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  return `${day} ${month}`;
}

/** Full date for the notice detail, e.g. "Tue 10 Nov, 9:30 am" in the inspector tz. */
export function formatFullNoticeDate(
  iso: string | null | undefined,
  timeZone: string = PLATFORM_TIMEZONE,
): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const period = get('dayPeriod').toLowerCase();
  return `${get('weekday')} ${get('day')} ${get('month')}, ${get('hour')}:${get('minute')} ${period}`;
}
