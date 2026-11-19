import type { ReliabilityMetricResult } from '@properfy/shared';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  metricLabel,
  metricDescription,
  formatMetricValue,
  hasWeightedMinutesTooltip,
  weightedMinutesLabel,
} from '../lib/format-metric';
import { MetricFailures } from './MetricFailures';

export type MetricWithWeight = ReliabilityMetricResult & { weight: number };

export interface MetricRowProps {
  metric: MetricWithWeight;
  minimumRatings: number;
  volumeReferenceSource: 'MEDIAN' | 'OVERRIDE' | null;
}

/**
 * One metric line in the drawer (03.12). Shows the label, description, the
 * formatted value with a decorative (aria-hidden) bar beside it, the weight (or
 * "Not weighted"), the weighted-minutes tooltip (except satisfaction/volume),
 * and the expandable failures. Information is never conveyed by colour alone.
 */
export function MetricRow({ metric, minimumRatings, volumeReferenceSource }: MetricRowProps) {
  const value = formatMetricValue(metric, { minimumRatings, volumeReferenceSource });
  const notWeighted = metric.weight === 0;
  const showTooltip = hasWeightedMinutesTooltip(metric.metric) && !value.isNoData;

  const primary = (
    <span className={value.isNoData ? 'text-sm text-text-muted' : 'text-sm font-semibold text-text-primary'}>
      {value.primary}
    </span>
  );

  return (
    <div className={notWeighted ? 'py-3 opacity-60' : 'py-3'}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">{metricLabel(metric.metric)}</span>
        <span className="text-xs font-medium text-text-muted">
          {notWeighted ? 'Not weighted' : `Weight ${metric.weight}`}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-text-secondary">{metricDescription(metric.metric, minimumRatings)}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {showTooltip ? <Tooltip label={weightedMinutesLabel(metric)}>{primary}</Tooltip> : primary}
        {metric.rate !== null && (
          <span aria-hidden="true" className="hidden h-1.5 w-20 overflow-hidden rounded bg-app-bg sm:block">
            <span className="block h-full rounded bg-primary" style={{ width: `${Math.round(metric.rate * 100)}%` }} />
          </span>
        )}
        <span className="text-xs text-text-secondary">{value.detail}</span>
      </div>
      <MetricFailures failures={metric.failures} failureCount={metric.failureCount} />
    </div>
  );
}
