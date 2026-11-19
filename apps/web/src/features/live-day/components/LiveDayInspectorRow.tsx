import { cn } from '@properfy/frontend-standards';
import {
  type LiveDayInspector,
  LIVE_DAY_ALERT_LABELS,
  inspectorRouteColor,
} from '@properfy/shared';
import { Tooltip } from '@/components/ui/Tooltip';
import { LiveDayStateBadge } from './LiveDayStateBadge';
import { formatDelay } from '../lib/liveDayView';

interface LiveDayInspectorRowProps {
  inspector: LiveDayInspector;
  selected: boolean;
  isFutureDay: boolean;
  onSelect: () => void;
}

interface Chip {
  key: string;
  label: string;
  title?: string;
}

function routeChips(inspector: LiveDayInspector, isFutureDay: boolean): Chip[] {
  const chips: Chip[] = [];
  if (inspector.routeApproximate) {
    chips.push({
      key: 'approximate',
      label: 'Approximate route',
      title: "Straight lines between stops — the planned road route isn't available.",
    });
  }
  if (inspector.routeOutOfDate) chips.push({ key: 'stale', label: 'Route may be out of date' });
  if (inspector.planStatus === 'DRAFT') chips.push({ key: 'draft', label: 'Not published yet' });
  if (inspector.planStatus === 'NONE') {
    chips.push({
      key: 'none',
      label: isFutureDay ? 'Route not generated yet — plans publish at 19:30' : 'No route plan',
    });
  }
  return chips;
}

/**
 * One inspector in the Live Day list. The whole row is a selection button; the
 * delay goes to a warning tone past the inspector's threshold, each alert adds an
 * icon plus a screen-reader summary, and the plan chips reflect the route state.
 * "Route infeasible" is an INDICATOR beside the button (not an alert): it never
 * counts toward "Needs attention" nor changes the sort order (D20, L-F04-05).
 */
export function LiveDayInspectorRow({ inspector, selected, isFutureDay, onSelect }: LiveDayInspectorRowProps) {
  const color = inspectorRouteColor(inspector.inspectorId).hex;
  const { done, total } = inspector.progress;
  const over = inspector.delayMinutes != null && inspector.delayMinutes > inspector.thresholds.delayMinutes;
  const unknown = inspector.lastKnown.source === 'NONE';
  const chips = routeChips(inspector, isFutureDay);
  const alertLabels = inspector.alerts.map((a) => LIVE_DAY_ALERT_LABELS[a.type]);

  const infeasibleLabel = [
    "Some stops can't be reached within their window:",
    ...inspector.routeViolations.map((v) => `${v.appointmentCode} · ~${v.lateMinutes} min after its window`),
  ].join('\n');

  return (
    <li data-inspector-row={inspector.inspectorId} className="border-b border-border-subtle last:border-b-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          'flex w-full min-h-[44px] flex-col gap-1 px-3 py-2 text-left transition hover:bg-app-bg',
          selected && 'bg-primary/10',
        )}
      >
        <div className="flex items-center gap-2">
          <span
            data-testid="inspector-dot"
            data-color={color}
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="truncate font-semibold text-text-primary">{inspector.inspectorName}</span>
          <LiveDayStateBadge state={inspector.state} className="ml-auto" />
        </div>

        <div className="flex items-center gap-2">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-label={`${inspector.inspectorName} progress`}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-border-subtle"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
            />
          </div>
          <span className="shrink-0 text-xs text-text-secondary">
            {done} of {total} done
          </span>
          <span className={cn('shrink-0 text-xs font-semibold', over ? 'text-warning' : 'text-text-secondary')}>
            {formatDelay(inspector.delayMinutes)}
          </span>
        </div>

        {(inspector.alerts.length > 0 || chips.length > 0 || unknown) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {inspector.alerts.length > 0 && (
              <span className="flex items-center gap-0.5 text-warning">
                {inspector.alerts.map((a, i) => (
                  <i key={i} className="mdi mdi-alert-circle text-base leading-none" aria-hidden="true" />
                ))}
                <span className="sr-only">
                  {inspector.alerts.length} alert{inspector.alerts.length === 1 ? '' : 's'}: {alertLabels.join(', ')}
                </span>
              </span>
            )}
            {chips.map((chip) => (
              <span
                key={chip.key}
                title={chip.title}
                className="rounded bg-app-bg px-1.5 py-0.5 text-xs text-text-secondary"
              >
                {chip.label}
              </span>
            ))}
            {unknown && <span className="text-xs italic text-text-muted">Location unknown</span>}
          </div>
        )}
      </button>

      {!inspector.routeFeasible && (
        <div className="px-3 pb-2">
          <Tooltip label={infeasibleLabel}>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
              <i className="mdi mdi-alert-outline text-sm leading-none" aria-hidden="true" />
              Route infeasible
            </span>
          </Tooltip>
        </div>
      )}
    </li>
  );
}
