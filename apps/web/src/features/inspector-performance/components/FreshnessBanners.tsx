import { formatInstantTime, PLATFORM_TIMEZONE } from '@properfy/shared';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { resolveFreshness } from '../lib/freshness';
import { formatReliabilityDate } from '../lib/format-metric';

export interface FreshnessBannersProps {
  isStale: boolean;
  snapshotDate: string | null;
  settingsUpdatedAt: string | null;
  computedAt: string | null;
  /** Injectable clock for tests; defaults to now. */
  now?: Date;
}

const staleMessage = (date: string) =>
  `Scores haven't been updated since ${date}. The nightly job didn't finish; operations has been notified.`;

const recomputePendingMessage = (time: string) =>
  `Weights were changed at ${time}. Scores will update within a few minutes.`;

const recomputeOverdueMessage = (time: string) =>
  `Weights were changed at ${time} but scores haven't been recalculated yet. Operations has been notified.`;

/**
 * Stale-snapshot and pending-recompute warnings (L-F07-02 / L-F07-10), shown on
 * both the ranking page and the drawer. No polling — the banners change only on
 * reload or query invalidation. The *which* decision is in the pure
 * `resolveFreshness`; this component only renders the copy.
 */
export function FreshnessBanners({
  isStale,
  snapshotDate,
  settingsUpdatedAt,
  computedAt,
  now,
}: FreshnessBannersProps) {
  const state = resolveFreshness({
    isStale,
    snapshotDate,
    settingsUpdatedAt,
    computedAt,
    now: now ?? new Date(),
  });

  if (!state.stale && !state.recompute) return null;

  return (
    <div className="flex flex-col gap-2">
      {state.stale && (
        <InfoBanner variant="warning">{staleMessage(formatReliabilityDate(state.stale.snapshotDate))}</InfoBanner>
      )}
      {state.recompute && (
        <InfoBanner variant="warning">
          {state.recompute.overdue
            ? recomputeOverdueMessage(formatInstantTime(state.recompute.changedAt, PLATFORM_TIMEZONE))
            : recomputePendingMessage(formatInstantTime(state.recompute.changedAt, PLATFORM_TIMEZONE))}
        </InfoBanner>
      )}
    </div>
  );
}
