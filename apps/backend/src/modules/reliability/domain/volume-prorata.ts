/**
 * Volume pro-rata for a newly registered inspector (L-F07-05). A civil date is a
 * tz-agnostic `YYYY-MM-DD`; day counting is done in UTC so DST never shifts it.
 */

function civilToUtcMs(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

function inclusiveDays(from: string, to: string): number {
  return Math.floor((civilToUtcMs(to) - civilToUtcMs(from)) / 86_400_000) + 1;
}

/** Inclusive length of the civil period `[from, to]` in days (`to − from + 1`). */
export function periodLengthDays(from: string, to: string): number {
  return inclusiveDays(from, to);
}

/**
 * Civil days the inspector was registered within `[from, to]` (inclusive): from
 * `max(from, inspectorCreatedOn)` to `to`. Zero when registered after `to`.
 * String comparison is a valid civil-date ordering for `YYYY-MM-DD`.
 */
export function activeDaysInPeriod(inspectorCreatedOn: string, from: string, to: string): number {
  const start = inspectorCreatedOn > from ? inspectorCreatedOn : from;
  if (start > to) return 0;
  return inclusiveDays(start, to);
}

/**
 * VOLUME rate (metric 7, L-F07-05): `min(1, completedCount / (volumeReference ×
 * activeDays / periodDays))`. Null when `activeDays` is 0 (registered after the
 * period). The denominator `volumeReference × activeDays / periodDays` is the
 * metric's `weightedEligible`.
 */
export function proratedVolumeRate(
  completedCount: number,
  volumeReference: number,
  activeDays: number,
  periodDays: number,
): number | null {
  if (activeDays <= 0) return null;
  const effectiveReference = effectiveVolumeReference(volumeReference, activeDays, periodDays);
  if (effectiveReference <= 0) return null;
  return Math.min(1, completedCount / effectiveReference);
}

/** `volumeReference × activeDays / periodDays` — the VOLUME metric's weightedEligible. */
export function effectiveVolumeReference(
  volumeReference: number,
  activeDays: number,
  periodDays: number,
): number {
  return (volumeReference * activeDays) / periodDays;
}
