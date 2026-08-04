import type { DashboardAnalyticsResponse } from '@properfy/shared';
import { ChartCard } from './charts/ChartCard';
import { SEQUENTIAL_HUE } from './charts/theme';

interface AvgExecutionBarsProps {
  avgExecutionMinutes: DashboardAnalyticsResponse['avgExecutionMinutes'];
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Magnitude comparison, so length carries the value and every bar shares one
 * hue — colouring these categorically would imply an identity distinction the
 * reader does not need to make here.
 *
 * Hand-rolled rather than Recharts: with a handful of rows a flex bar is
 * lighter, keeps the label and value in real text (selectable, readable by a
 * screen reader), and avoids a chart library's tick collisions on long names.
 */
export function AvgExecutionBars({ avgExecutionMinutes }: AvgExecutionBarsProps) {
  const rows = avgExecutionMinutes.filter((row) => row.avgMinutes !== null);
  const longest = Math.max(...rows.map((row) => row.avgMinutes ?? 0), 1);

  return (
    <ChartCard
      title="Average execution time"
      caption="From inspection start to finish, per service type"
      emptyMessage="No inspection finished in this period."
      tableRows={rows}
      tableColumns={[
        { header: 'Service type', cell: (row) => row.name },
        { header: 'Average', cell: (row) => formatDuration(row.avgMinutes ?? 0), numeric: true },
        { header: 'Sample', cell: (row) => row.sampleSize, numeric: true },
      ]}
    >
      <ul className="mt-2 space-y-3">
        {rows.map((row) => (
          <li key={row.serviceTypeId}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-text-primary">{row.name}</span>
              <span className="shrink-0 font-bold tabular-nums text-text-primary">
                {formatDuration(row.avgMinutes ?? 0)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full" style={{ backgroundColor: `${SEQUENTIAL_HUE}14` }}>
              {/* 4px rounded data-end, anchored to the baseline at left. */}
              <div
                className="h-full rounded-full"
                style={{
                  width: `${((row.avgMinutes ?? 0) / longest) * 100}%`,
                  backgroundColor: SEQUENTIAL_HUE,
                }}
              />
            </div>
            <p className="mt-0.5 text-xs text-text-muted">
              {row.sampleSize} {row.sampleSize === 1 ? 'inspection' : 'inspections'}
            </p>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}
