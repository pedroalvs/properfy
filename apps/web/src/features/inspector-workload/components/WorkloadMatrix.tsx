import type { InspectorWorkloadResponse, WorkloadMatrixRow } from '@properfy/shared';
import { ChartCard } from '@/features/analytics/components/charts/ChartCard';
import { SEQUENTIAL_HUE } from '@/features/analytics/components/charts/theme';
import {
  LEVEL_LABEL,
  TOTAL_LEVEL_CLASS,
  cellStyle,
  dayLevel,
  formatDayHeader,
  withAlpha,
} from './workload-visuals';

interface WorkloadMatrixProps {
  matrix: InspectorWorkloadResponse['matrix'];
  week: InspectorWorkloadResponse['week'];
  thresholds: InspectorWorkloadResponse['thresholds'];
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * One row per inspector, one column per day of the selected week.
 *
 * Cells encode magnitude with a single-hue wash and always print the count, so
 * the value never depends on colour. The Total column is the one status-coloured
 * element — a weekly total is a *state* (normal / busy / overloaded) rather than
 * a magnitude — and it carries the number plus a level word in its accessible
 * name.
 *
 * `ChartCard` supplies the mandatory table view. That toggle is not redundant
 * here even though this view is already grid-shaped: the table drops colour
 * entirely and adds an explicit Level column, which is the relief the chart
 * palette requires for print, forced-colors and screen readers.
 */
export function WorkloadMatrix({ matrix, week, thresholds }: WorkloadMatrixProps) {
  const dayColumns = week.days.map((date, index) => ({
    header: formatDayHeader(date),
    cell: (row: WorkloadMatrixRow) => row.days[index] ?? 0,
    numeric: true,
  }));

  return (
    <ChartCard<WorkloadMatrixRow>
      title="Inspections per inspector"
      caption={`Scheduled or completed work, by scheduled date. Busy from ${thresholds.weeklyBusy} a week, overloaded from ${thresholds.weeklyOverloaded}.`}
      tableRows={matrix.inspectors}
      tableColumns={[
        { header: 'Inspector', cell: (row) => row.inspectorName },
        ...dayColumns,
        { header: 'Total', cell: (row) => row.total, numeric: true },
        { header: 'Level', cell: (row) => LEVEL_LABEL[row.level] },
      ]}
      emptyMessage="No inspectors are carrying work this week."
    >
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-secondary">
        <LegendSwatch color={withAlpha(SEQUENTIAL_HUE, 0.12)} label={`Under ${thresholds.dailyBusy} a day`} />
        <LegendSwatch
          color={withAlpha(SEQUENTIAL_HUE, 0.3)}
          label={`${thresholds.dailyBusy}–${thresholds.dailyOverloaded - 1} a day`}
        />
        <LegendSwatch color={withAlpha(SEQUENTIAL_HUE, 0.55)} label={`${thresholds.dailyOverloaded}+ a day`} />
        <span className="flex items-center gap-1.5">
          <span className="rounded bg-warning/15 px-1.5 py-0.5 font-bold text-warning">Total</span>
          Busy or overloaded for the week
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">
            Inspections per inspector for each day of the selected week, with the weekly total and
            capacity level.
          </caption>
          <thead>
            <tr className="border-b border-black/10">
              <th scope="col" className="py-2 pr-3 text-left text-xs font-bold text-text-secondary">
                Inspector
              </th>
              {week.days.map((date) => (
                <th
                  key={date}
                  scope="col"
                  className="px-1 py-2 text-center text-xs font-bold text-text-secondary"
                >
                  {formatDayHeader(date)}
                </th>
              ))}
              <th scope="col" className="py-2 pl-3 text-right text-xs font-bold text-text-secondary">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.inspectors.map((row) => (
              <tr key={row.inspectorId} className="border-b border-black/5 last:border-0">
                <th
                  scope="row"
                  className="py-1.5 pr-3 text-left text-sm font-semibold text-text-primary"
                >
                  {row.inspectorName}
                  {!row.isActive && (
                    <span className="ml-2 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-bold uppercase text-text-muted">
                      Inactive
                    </span>
                  )}
                </th>
                {row.days.map((count, index) => (
                  <td key={week.days[index]} className="px-1 py-1">
                    <div
                      className="rounded py-1.5 text-center text-sm font-bold tabular-nums text-text-primary"
                      style={cellStyle(count, thresholds)}
                      title={`${row.inspectorName} — ${formatDayHeader(week.days[index]!)}: ${count} inspections (${LEVEL_LABEL[dayLevel(count, thresholds)]})`}
                    >
                      {count}
                    </div>
                  </td>
                ))}
                <td className="py-1.5 pl-3 text-right">
                  <span
                    className={`inline-block min-w-[2.5rem] rounded px-2 py-0.5 text-sm font-bold tabular-nums ${TOTAL_LEVEL_CLASS[row.level]}`}
                    // The level word travels with the number so the status
                    // colour is never the only carrier of meaning.
                    aria-label={`${row.total} inspections this week — ${LEVEL_LABEL[row.level]}`}
                  >
                    {row.total}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black/20">
              <th scope="row" className="py-2 pr-3 text-left text-sm font-bold text-text-primary">
                Team total
              </th>
              {matrix.teamTotalsByDay.map((count, index) => (
                <td
                  key={week.days[index]}
                  className="px-1 py-2 text-center text-sm font-bold tabular-nums text-text-primary"
                >
                  {count}
                </td>
              ))}
              <td className="py-2 pl-3 text-right text-sm font-bold tabular-nums text-text-primary">
                {matrix.teamTotal}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ChartCard>
  );
}
