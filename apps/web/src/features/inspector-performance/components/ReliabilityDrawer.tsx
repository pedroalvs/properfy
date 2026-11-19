import type { InspectorReliabilityResponse } from '@properfy/shared';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useInspectorReliability } from '../hooks/useInspectorReliability';
import { FreshnessBanners } from './FreshnessBanners';
import { MetricRow, type MetricWithWeight } from './MetricRow';
import { formatScore } from '../lib/format-metric';

export interface ReliabilityDrawerProps {
  inspectorId: string | null;
  onClose: () => void;
}

const NOT_FOUND_MESSAGE = "We couldn't find this inspector.";
const LOAD_ERROR_MESSAGE = "We couldn't load this inspector's metrics.";
const NOT_COMPUTED_MESSAGE = 'This inspector will be scored after the next nightly run.';
const FOOTER_NORMALISATION = 'Percentages are weighted by service duration and planned travel.';
const FOOTER_SCHEDULE = 'Scores update every night at 4:15 am.';

function headlineScore(inspector: InspectorReliabilityResponse): string {
  switch (inspector.status) {
    case 'SCORED':
      return formatScore(inspector.score ?? 0);
    case 'INSUFFICIENT_VOLUME':
      return 'Not enough data';
    case 'NO_WEIGHTED_DATA':
      return 'No weighted data';
    case 'NOT_COMPUTED':
      return 'No score yet';
  }
}

function DrawerHeaderBlock({ inspector }: { inspector: InspectorReliabilityResponse }) {
  const inactive = inspector.inspectorStatus === 'INACTIVE';
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <span className="text-3xl font-bold text-secondary">{headlineScore(inspector)}</span>
        {inactive && (
          <span className="rounded bg-app-bg px-2 py-0.5 text-xs font-semibold text-text-muted">Inactive</span>
        )}
      </div>
      {inspector.status === 'SCORED' && inspector.position !== null && !inactive && (
        <p className="text-sm text-text-secondary">{`Rank ${inspector.position} of ${inspector.rankedCount}`}</p>
      )}
      {inspector.status === 'INSUFFICIENT_VOLUME' && (
        <p className="text-sm text-text-secondary">
          {`${inspector.volume} of ${inspector.minimumVolume} services needed to be ranked`}
        </p>
      )}
      {inspector.status === 'NOT_COMPUTED' ? (
        <p className="text-sm text-text-secondary">{NOT_COMPUTED_MESSAGE}</p>
      ) : (
        <p className="text-sm text-text-secondary">{`${inspector.volume} services · last 30 days`}</p>
      )}
    </div>
  );
}

function DrawerBody({
  inspector,
  isLoading,
  isError,
  isNotFound,
  refetch,
}: {
  inspector: InspectorReliabilityResponse | null;
  isLoading: boolean;
  isError: boolean;
  isNotFound: boolean;
  refetch: () => void;
}) {
  if (isNotFound) {
    return <p className="text-sm text-text-secondary">{NOT_FOUND_MESSAGE}</p>;
  }
  if (isLoading || (!inspector && !isError)) {
    return <LoadingState rows={6} variant="card" />;
  }
  if (isError || !inspector) {
    return <ErrorState message={LOAD_ERROR_MESSAGE} onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <FreshnessBanners
        isStale={inspector.isStale}
        snapshotDate={inspector.snapshotDate}
        settingsUpdatedAt={inspector.settingsUpdatedAt}
        computedAt={inspector.computedAt}
      />
      <DrawerHeaderBlock inspector={inspector} />
      {inspector.status !== 'NOT_COMPUTED' && (
        <div className="flex flex-col divide-y divide-app-bg">
          {inspector.metrics.map((metric) => (
            <MetricRow
              key={metric.metric}
              metric={metric as MetricWithWeight}
              minimumRatings={inspector.minimumRatings}
              volumeReferenceSource={inspector.volumeReferenceSource}
            />
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-col gap-1 text-xs text-text-muted">
        <p>{FOOTER_NORMALISATION}</p>
        <p>{FOOTER_SCHEDULE}</p>
      </div>
    </div>
  );
}

/**
 * Per-inspector reliability detail drawer (03.12). Deep-linked by `?inspector=`
 * (the page owns the param and focus restore). The detail query runs only while
 * open. Freshness banners repeat at the top; a 400/404 shows a distinct
 * not-found message.
 */
export function ReliabilityDrawer({ inspectorId, onClose }: ReliabilityDrawerProps) {
  const { inspector, isLoading, isError, isNotFound, refetch } = useInspectorReliability(inspectorId);
  const open = inspectorId !== null;
  const name = inspector?.inspectorName ?? '';

  return (
    <DrawerPanel
      open={open}
      onClose={onClose}
      size="narrow"
      ariaLabel={name ? `${name} reliability details` : 'Inspector reliability details'}
    >
      <DrawerHeader title={name || 'Inspector'} onClose={onClose} />
      <div className="h-[calc(100vh-4rem)] overflow-y-auto px-5 pb-8 pt-2">
        {open && (
          <DrawerBody
            inspector={inspector}
            isLoading={isLoading}
            isError={isError}
            isNotFound={isNotFound}
            refetch={refetch}
          />
        )}
      </div>
    </DrawerPanel>
  );
}
