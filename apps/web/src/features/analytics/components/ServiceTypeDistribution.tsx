import { useMemo } from 'react';
import type { DashboardAnalyticsResponse } from '@properfy/shared';
import { ChartCard } from './charts/ChartCard';
import { CATEGORICAL_SERIES, SERIES_OTHER } from './charts/theme';

interface ServiceTypeDistributionProps {
  distribution: DashboardAnalyticsResponse['serviceTypeDistribution'];
}

interface Segment {
  key: string;
  name: string;
  count: number;
  share: number;
  color: string;
}

/**
 * Assigns hues by a stable key rather than by rank, so a period where Ingoing
 * overtakes Routine does not swap their colours. Anything past the palette
 * folds into a single "Other" segment — a generated ninth hue is
 * indistinguishable from an existing one under CVD.
 */
function buildSegments(distribution: ServiceTypeDistributionProps['distribution']): Segment[] {
  const byCode = [...distribution].sort((a, b) => a.code.localeCompare(b.code));
  const total = byCode.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) return [];

  const named: Segment[] = byCode.slice(0, CATEGORICAL_SERIES.length).map((entry, index) => ({
    key: entry.serviceTypeId,
    name: entry.name,
    count: entry.count,
    share: (entry.count / total) * 100,
    color: CATEGORICAL_SERIES[index]!,
  }));

  const tail = byCode.slice(CATEGORICAL_SERIES.length);
  if (tail.length > 0) {
    const tailCount = tail.reduce((sum, entry) => sum + entry.count, 0);
    named.push({
      key: 'other',
      name: `Other (${tail.length})`,
      count: tailCount,
      share: (tailCount / total) * 100,
      color: SERIES_OTHER,
    });
  }

  // Order the bar by size for readability; the colours were already fixed above.
  return named.sort((a, b) => b.count - a.count);
}

/**
 * Part-to-whole as a horizontal stacked bar rather than a donut: service-type
 * names are long, and a stacked bar reads them inline instead of in a legend
 * the eye has to shuttle to.
 *
 * Direct labels are mandatory here, not decorative — three of the palette's
 * hues sit below 3:1 contrast on this surface, and visible labels plus the
 * table view are what makes that legal.
 */
export function ServiceTypeDistribution({ distribution }: ServiceTypeDistributionProps) {
  const segments = useMemo(() => buildSegments(distribution), [distribution]);

  return (
    <ChartCard
      title="By service type"
      caption="Share of services in the period"
      tableRows={segments}
      tableColumns={[
        { header: 'Service type', cell: (row) => row.name },
        { header: 'Services', cell: (row) => row.count, numeric: true },
        { header: 'Share', cell: (row) => `${row.share.toFixed(1)}%`, numeric: true },
      ]}
    >
      <div className="mt-2">
        {/* 2px surface gap between segments so adjacent fills stay separable. */}
        <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded" role="presentation">
          {segments.map((segment) => (
            <div
              key={segment.key}
              className="h-full first:rounded-l last:rounded-r"
              style={{ width: `${segment.share}%`, backgroundColor: segment.color }}
              title={`${segment.name}: ${segment.count}`}
            />
          ))}
        </div>

        <ul className="mt-4 space-y-2">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: segment.color }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-text-primary">{segment.name}</span>
              <span className="shrink-0 tabular-nums text-text-secondary">
                {segment.count} · {segment.share.toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}
