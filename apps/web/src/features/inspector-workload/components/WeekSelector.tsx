import type { WorkloadWeek } from '../hooks/useWorkloadWeek';
import { formatWeekRange } from './workload-visuals';

interface WeekSelectorProps {
  week: WorkloadWeek;
}

const STEP_CLASS =
  'flex h-8 w-8 items-center justify-center rounded border border-black/10 text-text-secondary transition hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * Week navigation for the whole screen. Governs the KPIs, the comparison strip
 * and the matrix alike — there is one selected week, not one per panel.
 *
 * The date input accepts any day and the hook snaps it to that week's Monday, so
 * an operator can jump to a week by picking any date inside it and the API never
 * receives the non-Monday it would reject.
 */
export function WeekSelector({ week }: WeekSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="week-selector">
      <button type="button" onClick={week.goPrev} className={STEP_CLASS} aria-label="Previous week">
        <i className="mdi mdi-chevron-left text-xl" aria-hidden="true" />
      </button>

      <span
        className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-card-bg px-3 py-1.5 text-sm font-semibold text-text-secondary"
        // The range is the page's current scope; announce it when it changes.
        aria-live="polite"
      >
        <i className="mdi mdi-calendar-week text-base" aria-hidden="true" />
        {formatWeekRange(week.weekStart, week.weekEnd)}
      </span>

      <button type="button" onClick={week.goNext} className={STEP_CLASS} aria-label="Next week">
        <i className="mdi mdi-chevron-right text-xl" aria-hidden="true" />
      </button>

      <label className="ml-1 flex items-center gap-2 text-xs font-semibold text-text-secondary">
        <span className="sr-only">Jump to the week containing a date</span>
        <input
          type="date"
          value={week.weekStart}
          onChange={(event) => week.setWeek(event.target.value)}
          className="rounded border border-black/10 px-2 py-1.5 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </label>

      <button
        type="button"
        onClick={week.goThisWeek}
        disabled={week.isCurrentWeek}
        className="rounded border border-black/10 px-3 py-1.5 text-xs font-bold text-text-secondary transition hover:bg-black/5 disabled:cursor-default disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        This week
      </button>
    </div>
  );
}
