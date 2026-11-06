import type { LiveDayStopRow } from './live-day.read-repository';
import { baselineInstant } from './stop-view';

/**
 * Accumulated delay (§5): `floor((startedAt - baseline) / 60s)` for the
 * non-abandoned started stop with the greatest `startedAt`, where
 * `baseline = published ?? service_start ?? window start`. Null when no stop is
 * started; may be negative (the UI shows "On time" when <= 0). Whole minutes,
 * truncated toward negative infinity.
 */
export function computeAccumulatedDelay(rows: LiveDayStopRow[]): number | null {
  const started = rows.filter((r) => r.startedAt !== null && r.abandonedAt === null);
  if (started.length === 0) return null;

  const latest = started.reduce((a, b) =>
    new Date(a.startedAt as string).getTime() >= new Date(b.startedAt as string).getTime() ? a : b,
  );
  const diffMs = new Date(latest.startedAt as string).getTime() - baselineInstant(latest).getTime();
  return Math.floor(diffMs / 60_000);
}
