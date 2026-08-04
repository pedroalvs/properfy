import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardAnalyticsResponse } from '@properfy/shared';
import { ChartCard } from './charts/ChartCard';
import { CHART_DEFAULTS, SEQUENTIAL_HUE } from './charts/theme';

interface EvolutionChartProps {
  evolution: DashboardAnalyticsResponse['evolution'];
  granularity: DashboardAnalyticsResponse['period']['granularity'];
}

function formatBucket(bucketStart: string): string {
  // en-AU orders this day-then-month ('2 Jul'); en-US would render 'Jul 2'.
  return Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(
    new Date(`${bucketStart}T00:00:00.000Z`),
  );
}

/**
 * The screen's hero: how service volume moves over the period.
 *
 * One series, so there is no legend — the title names it — and the fill is a
 * single hue rather than a categorical slot. An area rather than a line because
 * the quantity is a count accumulating against a zero baseline.
 */
export function EvolutionChart({ evolution, granularity }: EvolutionChartProps) {
  const data = useMemo(
    () => evolution.map((bucket) => ({ ...bucket, label: formatBucket(bucket.bucketStart) })),
    [evolution],
  );

  const caption = granularity === 'week' ? 'Services per week' : 'Services per day';

  return (
    <ChartCard
      title="Service volume"
      caption={caption}
      tableRows={data}
      tableColumns={[
        { header: granularity === 'week' ? 'Week of' : 'Date', cell: (row) => row.label },
        { header: 'Services', cell: (row) => row.count, numeric: true },
      ]}
      className="h-full"
    >
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={CHART_DEFAULTS.margin}>
            <defs>
              <linearGradient id="evolution-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SEQUENTIAL_HUE} stopOpacity={0.28} />
                <stop offset="100%" stopColor={SEQUENTIAL_HUE} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...CHART_DEFAULTS.grid} />
            <XAxis dataKey="label" {...CHART_DEFAULTS.axis} minTickGap={24} />
            <YAxis {...CHART_DEFAULTS.axis} allowDecimals={false} width={36} />
            <Tooltip {...CHART_DEFAULTS.tooltip} formatter={(value) => [String(value), 'Services']} />
            <Area
              type="monotone"
              dataKey="count"
              name="Services"
              stroke={SEQUENTIAL_HUE}
              fill="url(#evolution-fill)"
              {...CHART_DEFAULTS.line}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
