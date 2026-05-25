import type { InspectorBreakdowns, InspectorDayCount } from '../types';

interface Props {
  breakdowns: InspectorBreakdowns;
  tomorrowLabel: string;
}

function alertClasses(alertLevel: 'yellow' | 'red' | null): {
  dot: string;
  count: string;
} {
  if (alertLevel === 'red') return { dot: 'bg-error', count: 'text-error' };
  if (alertLevel === 'yellow') return { dot: 'bg-warning', count: 'text-warning' };
  return { dot: 'bg-gray-300', count: 'text-text-primary' };
}

interface InspectorListCardProps {
  title: string;
  rows: InspectorDayCount[];
  showLegend?: boolean;
}

function InspectorListCard({ title, rows, showLegend = false }: InspectorListCardProps) {
  return (
    <div className="bg-white shadow-sm rounded p-4 flex flex-col gap-2">
      <h3 className="text-base font-bold text-secondary flex items-center gap-2">
        <i className="mdi mdi-account-hard-hat text-xl" />
        {title}
      </h3>

      <div className="flex-1">
        {rows.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-2">No inspections</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((row) => {
              const cls = alertClasses(row.alertLevel);
              return (
                <li key={row.inspectorId} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm text-text-primary min-w-0">
                    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cls.dot}`} />
                    <span className="truncate">{row.inspectorName}</span>
                  </span>
                  <span className={`text-sm font-semibold flex-shrink-0 ${cls.count}`}>
                    {row.count}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showLegend && (
        <p
          className="text-xs text-text-secondary mt-2 border-t border-gray-100 pt-2"
          data-testid="tomorrow-legend"
        >
          🟡 ≥15 · 🔴 ≥18 inspections/day
        </p>
      )}
    </div>
  );
}

/**
 * Renders three per-inspector breakdown cards (Tomorrow, Scheduled This Week, Confirmed This Week).
 * Only shown when inspectorBreakdowns is non-null (AM/OP roles only).
 */
export function InspectorBreakdownSection({ breakdowns, tomorrowLabel }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <InspectorListCard
        title={tomorrowLabel}
        rows={breakdowns.tomorrowByInspector}
        showLegend
      />
      <InspectorListCard
        title="Scheduled This Week"
        rows={breakdowns.scheduledThisWeekByInspector}
      />
      <InspectorListCard
        title="Confirmed This Week"
        rows={breakdowns.confirmedThisWeekByInspector}
      />
    </div>
  );
}
