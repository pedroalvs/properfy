import {
  type LiveDayInspector,
  type LiveDayStop,
  LIVE_DAY_ALERT_TYPE_ORDER,
  LIVE_DAY_SHOW_ALL_MAX,
  formatInstantTime,
  formatWallTime,
} from '@properfy/shared';
import type { RouteEmphasis } from '@/components/map';

/**
 * Pure selectors and formatters for the Live Day screen (TASK-F05-2). No React,
 * no I/O — these drive the list, the routes and the stop/time copy and are the
 * easiest part of the screen to test in isolation.
 */

/** Keep only inspectors that need attention when the filter is on. */
export function filterInspectors(
  list: LiveDayInspector[],
  opts: { needsAttention: boolean },
): LiveDayInspector[] {
  return opts.needsAttention ? list.filter((i) => i.needsAttention) : list;
}

export interface RouteToDraw {
  inspector: LiveDayInspector;
  emphasis: RouteEmphasis;
}

/**
 * Which routes to draw, and how emphasised. `list` is already the visible
 * (filtered) list. With show-all off, only the selected inspector draws
 * (emphasis `selected`). With show-all on, every visible inspector draws — the
 * selected one `selected`, the rest `muted` if there is a selection, else all
 * `normal` (D6/D18).
 */
export function routesToDraw(
  list: LiveDayInspector[],
  opts: { showAll: boolean; selectedId: string | null },
): RouteToDraw[] {
  const { showAll, selectedId } = opts;
  if (!showAll) {
    if (!selectedId) return [];
    const selected = list.find((i) => i.inspectorId === selectedId);
    return selected ? [{ inspector: selected, emphasis: 'selected' }] : [];
  }
  return list.map((inspector) => ({
    inspector,
    emphasis: !selectedId
      ? 'normal'
      : inspector.inspectorId === selectedId
        ? 'selected'
        : 'muted',
  }));
}

/** "Show all routes" is only allowed up to the client cap (L-F05-06). */
export function canShowAllRoutes(visibleCount: number): boolean {
  return visibleCount <= LIVE_DAY_SHOW_ALL_MAX;
}

/**
 * Whether a day is "live" and should poll: today or tomorrow in the server's
 * civil frame (L-F05-05). A null `date` means today (so live); a null `today`
 * means the first response has not arrived yet, so assume live and poll.
 */
export function isLiveDate(date: string | null, today: string | null): boolean {
  if (date == null) return true;
  if (today == null) return true;
  return date >= today;
}

/** Accumulated delay: late → "+22 min", on-time/early → "On time", unknown → "—". */
export function formatDelay(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes <= 0) return 'On time';
  return `+${minutes} min`;
}

const RANGE = ' – ';

/**
 * Per-stop time copy, always formatted in the stop's agency timezone and as 12h
 * am/pm (the product-wide convention, F04-5). Past days show "Planned" rather
 * than "ETA" because the server does not project ETAs for them (L-F05-02).
 */
export function stopTimeLabel(stop: LiveDayStop, opts: { isPastDay: boolean }): string {
  const tz = stop.timezone;
  const at = (iso: string | null | undefined) => formatInstantTime(iso ?? '', tz) || '—';

  switch (stop.progress) {
    case 'DONE':
      if (stop.startedAt && stop.finishedAt) return `Done ${at(stop.startedAt)}${RANGE}${at(stop.finishedAt)}`;
      return 'Done (no check-in)';
    case 'CURRENT':
      if (stop.startedAt) return `In progress since ${at(stop.startedAt)}`;
      return `Next · ETA ${at(stop.predictedStartAt)}`;
    case 'OPEN':
      return `Started ${at(stop.startedAt)} · not checked out`;
    case 'REMAINING':
      if (!stop.inPlan) return `Window ${formatWallTime(stop.windowStart)}${RANGE}${formatWallTime(stop.windowEnd)}`;
      return `${opts.isPastDay ? 'Planned' : 'ETA'} ${at(stop.predictedStartAt)}`;
    default:
      return '';
  }
}

/** Rank of an inspector's most severe alert; no alert sorts last. */
function severityRank(inspector: LiveDayInspector): number {
  if (inspector.alerts.length === 0) return LIVE_DAY_ALERT_TYPE_ORDER.length;
  return Math.min(
    ...inspector.alerts.map((a) => {
      const idx = LIVE_DAY_ALERT_TYPE_ORDER.indexOf(a.type);
      return idx === -1 ? LIVE_DAY_ALERT_TYPE_ORDER.length : idx;
    }),
  );
}

/**
 * Sort by the most severe alert first (L-F05-08), then inspector name. Returns a
 * new array; callers freeze the order during interaction via `useFrozenOrder`.
 */
export function sortInspectors(list: LiveDayInspector[]): LiveDayInspector[] {
  return [...list].sort((a, b) => {
    const byRank = severityRank(a) - severityRank(b);
    if (byRank !== 0) return byRank;
    return a.inspectorName.localeCompare(b.inspectorName, 'en-AU');
  });
}
