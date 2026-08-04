import type { InspectorWorkloadResponse } from '@properfy/shared';
import { formatMonthLabel } from './workload-visuals';

interface CompletedSummaryProps {
  completed: InspectorWorkloadResponse['completed'];
}

interface CompletedTileProps {
  label: string;
  value: number;
  comparison: { label: string; value: number };
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const difference = current - previous;
  if (difference === 0) {
    return <span className="text-text-muted">Level with {previous}</span>;
  }
  const up = difference > 0;
  return (
    <span className={up ? 'text-success' : 'text-error'}>
      {/* An arrow glyph plus a signed number — direction never rests on colour. */}
      <i className={`mdi ${up ? 'mdi-arrow-up' : 'mdi-arrow-down'} mr-0.5`} aria-hidden="true" />
      {up ? '+' : ''}
      {difference}
    </span>
  );
}

function CompletedTile({ label, value, comparison }: CompletedTileProps) {
  return (
    <div className="rounded bg-card-bg p-4 shadow-sm" data-testid="completed-tile">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
          <i className="mdi mdi-check text-base" aria-hidden="true" />
        </span>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-text-muted">{label}</div>
          <div className="text-xl font-bold tabular-nums text-text-primary">{value}</div>
        </div>
      </div>
      <div className="mt-2 text-xs font-semibold">
        <Delta current={value} previous={comparison.value} />
        <span className="ml-1 font-normal text-text-muted">
          vs {comparison.label} ({comparison.value})
        </span>
      </div>
    </div>
  );
}

/**
 * Completion figures for the selected week and its month.
 *
 * Everything here is counted **by scheduled date**, the same key as the rest of
 * the screen, so the week figure and the month figure are directly comparable.
 * Counting by execution timestamp would be a different question and would also
 * under-report, since that column stays null until an operator cross-checks.
 */
export function CompletedSummary({ completed }: CompletedSummaryProps) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">
        Completed <span className="font-normal normal-case tracking-normal">· by scheduled date</span>
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CompletedTile
          label="Done in selected week"
          value={completed.doneSelectedWeek}
          comparison={{ label: 'previous week', value: completed.donePreviousWeek }}
        />
        <CompletedTile
          label={`Done in ${formatMonthLabel(completed.selectedMonth)}`}
          value={completed.doneSelectedMonth}
          comparison={{
            label: formatMonthLabel(completed.previousMonth),
            value: completed.donePreviousMonth,
          }}
        />
      </div>
    </section>
  );
}
