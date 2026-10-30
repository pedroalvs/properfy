import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { formatInstantDateTime } from '@/lib/format-date';

/**
 * Relative "last seen" label for the inspector app heartbeat.
 *
 * `null` → "Never". A future instant (clock skew) or under a minute → "Just now".
 * Otherwise minutes / hours / days ago. The heartbeat is throttled client-side to
 * at most every 6 h, so this value can legitimately lag — the caller's tooltip
 * says so (L-F01-09).
 */
export function formatLastSeenRelative(value: string | null, now: Date = new Date()): string {
  if (!value) return 'Never';

  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return 'Never';

  const diffMs = now.getTime() - then;
  if (diffMs < 60_000) return 'Just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

/**
 * Absolute "last seen" timestamp, always rendered in the platform (Sydney)
 * timezone — never the browser's — so the tooltip is unambiguous (memory
 * "Sydney only"). `formatInstantDateTime` defaults to the signed-in user's
 * timezone, so the Sydney zone is passed explicitly.
 */
export function formatLastSeenAbsolute(value: string | null): string | null {
  if (!value) return null;
  return formatInstantDateTime(value, PLATFORM_TIMEZONE);
}
