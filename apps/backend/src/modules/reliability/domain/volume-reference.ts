import { RELIABILITY_WINDOW_DAYS } from '@properfy/shared';

export interface VolumeReference {
  value: number;
  source: 'MEDIAN' | 'OVERRIDE';
  activeInspectors: number;
  periodDays: number;
}

/** Round to the nearest 0.5 (ties up), e.g. 4.667 → 4.5, 9.333 → 9.5. */
function roundToHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * The volume-metric reference (P11, L-F07-09), computed once per run:
 *
 * - With a non-null `override`, a fixed reference scaled by the period:
 *   `max(1, roundToHalf(override × periodDays / 30))`.
 * - Otherwise the median `completedCount` of the active inspectors (those with
 *   ≥ 1 DONE in the window), floored at 1; an even count averages the two middle
 *   values. With no active inspector the reference is 1.
 *
 * `activeInspectors` always counts the ≥ 1 entries, regardless of source.
 */
export function computeVolumeReference(
  completedCounts: number[],
  override: number | null,
  periodDays: number,
): VolumeReference {
  const active = completedCounts.filter((count) => count >= 1);
  const activeInspectors = active.length;

  if (override !== null) {
    const scaled = roundToHalf((override * periodDays) / RELIABILITY_WINDOW_DAYS);
    return { value: Math.max(1, scaled), source: 'OVERRIDE', activeInspectors, periodDays };
  }

  return { value: Math.max(1, median(active)), source: 'MEDIAN', activeInspectors, periodDays };
}
