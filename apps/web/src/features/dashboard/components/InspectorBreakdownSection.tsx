import {
  DAILY_WORKLOAD_THRESHOLDS,
  WEEKLY_WORKLOAD_THRESHOLDS,
  type WorkloadThresholds,
} from '@properfy/shared';
import type { InspectorBreakdowns, InspectorDayCount } from '../types';

interface Props {
  breakdowns: InspectorBreakdowns;
  tomorrowLabel: string;
}

type AlertLevel = 'yellow' | 'red' | null;

function alertClasses(alertLevel: AlertLevel): {
  dot: string;
  count: string;
} {
  if (alertLevel === 'red') return { dot: 'bg-error', count: 'text-error' };
  if (alertLevel === 'yellow') return { dot: 'bg-warning', count: 'text-warning' };
  return { dot: 'bg-gray-300', count: 'text-text-primary' };
}

/**
 * The word behind the colour. The dot and the count colour are the only visual
 * signal, which leaves colourblind, high-contrast and screen-reader users with
 * nothing — so the level travels in each row's accessible name too.
 */
function alertLabel(alertLevel: AlertLevel): string {
  if (alertLevel === 'red') return 'Overloaded';
  if (alertLevel === 'yellow') return 'Busy';
  return 'Normal';
}

interface InspectorListCardProps {
  title: string;
  rows: InspectorDayCount[];
  /** Thresholds matching this card's window — they drive the legend text. */
  thresholds: WorkloadThresholds;
  /** The window the counts cover, for the legend wording. */
  unit: 'day' | 'week';
}

function InspectorListCard({ title, rows, thresholds, unit }: InspectorListCardProps) {
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
                <li
                  key={row.inspectorId}
                  className="flex items-center justify-between gap-2"
                  // Name, count and level in one string: the colour alone does
                  // not survive a screen reader or forced-colors mode.
                  aria-label={`${row.inspectorName} — ${row.count} inspections, ${alertLabel(row.alertLevel)}`}
                >
                  <span className="flex items-center gap-2 text-sm text-text-primary min-w-0">
                    <span
                      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cls.dot}`}
                      aria-hidden="true"
                    />
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

      {/* Every card carries a legend, and the numbers come from the shared
          constants rather than a literal. The old hardcoded "≥15 · ≥18
          inspections/day" was how the text drifted from the logic: those are
          the WEEKLY numbers, and only this card is daily. */}
      <p
        className="text-xs text-text-secondary mt-2 border-t border-gray-100 pt-2"
        data-testid="breakdown-legend"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-warning mr-1" aria-hidden="true" />
        Busy ≥{thresholds.busy}
        {' · '}
        <span className="inline-block w-2 h-2 rounded-full bg-error mr-1" aria-hidden="true" />
        Overloaded ≥{thresholds.overloaded} inspections that {unit}
      </p>
    </div>
  );
}

/**
 * Renders three per-inspector breakdown cards (Tomorrow, Scheduled This Week, Confirmed This Week).
 * Only shown when inspectorBreakdowns is non-null (AM/OP roles only).
 *
 * Each card is classified by the thresholds matching its own window — the
 * tomorrow list counts one day, the other two count seven. The server applies
 * the same split; these props only drive the legend text, so the two must agree.
 */
export function InspectorBreakdownSection({ breakdowns, tomorrowLabel }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <InspectorListCard
        title={tomorrowLabel}
        rows={breakdowns.tomorrowByInspector}
        thresholds={DAILY_WORKLOAD_THRESHOLDS}
        unit="day"
      />
      <InspectorListCard
        title="Scheduled This Week"
        rows={breakdowns.scheduledThisWeekByInspector}
        thresholds={WEEKLY_WORKLOAD_THRESHOLDS}
        unit="week"
      />
      <InspectorListCard
        title="Confirmed This Week"
        rows={breakdowns.confirmedThisWeekByInspector}
        thresholds={WEEKLY_WORKLOAD_THRESHOLDS}
        unit="week"
      />
    </div>
  );
}
