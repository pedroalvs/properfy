/**
 * Lock-screen-safe notice text for ROUTE_PUBLISHED / ROUTE_CHANGED (F02, R-F02).
 * Only date, count, time and suburb — never a contact name/phone, key/lockbox
 * code, meeting location or full address. Times are in the plan timezone.
 */

export interface NoticeStop {
  /** First not-started stop's service start (null = all started/done). */
  serviceStartAt: Date | null;
  suburb: string;
}

export interface RoutePublishedNoticeInput {
  planDate: Date;
  timezone: string;
  count: number;
  firstStop: NoticeStop | null;
  finishEta: Date | null;
  feasible: boolean;
  lateCount: number;
  approximate: boolean;
}

export interface RouteChangedNoticeInput {
  planDate: Date;
  timezone: string;
  /** Count of inspections remaining (not DONE). */
  remaining: number;
  firstStop: NoticeStop | null;
}

function fmtDate(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

function fmtTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function buildRoutePublishedNotice(input: RoutePublishedNoticeInput): { title: string; body: string } {
  const title = 'Your route for tomorrow is ready';
  const when = fmtDate(input.planDate, input.timezone);
  const first =
    input.firstStop && input.firstStop.serviceStartAt
      ? ` First stop at ${fmtTime(input.firstStop.serviceStartAt, input.timezone)} in ${input.firstStop.suburb};`
      : '';
  const finish = input.finishEta ? ` finish around ${fmtTime(input.finishEta, input.timezone)}` : '';
  const late =
    !input.feasible && input.lateCount > 0
      ? `, ${input.lateCount} stop${input.lateCount === 1 ? '' : 's'} may arrive after its window`
      : '';
  const approx = input.approximate ? ' Travel times are approximate.' : '';
  const body = `${input.count} inspection${input.count === 1 ? '' : 's'} on ${when}.${first}${finish}${late}. Open Properfy to see the order.${approx}`;
  return { title, body };
}

export function buildRouteChangedNotice(input: RouteChangedNoticeInput): { title: string; body: string } {
  const title = `Your route for ${fmtDate(input.planDate, input.timezone)} was updated`;
  const body =
    input.firstStop && input.firstStop.serviceStartAt
      ? `Operations recalculated your route: ${input.remaining} inspection${input.remaining === 1 ? '' : 's'}, first stop at ${fmtTime(input.firstStop.serviceStartAt, input.timezone)} in ${input.firstStop.suburb}. Open Properfy to see the new order.`
      : `Operations recalculated your route: ${input.remaining} inspection${input.remaining === 1 ? '' : 's'} remaining. Open Properfy to see the new order.`;
  return { title, body };
}

/** `route-changed:{dayPlanId}:{floor(epochMs/600000)}` — one notice per plan per 10 minutes (L-F04-06). */
export function routeChangedDedupeKey(dayPlanId: string, now: Date): string {
  return `route-changed:${dayPlanId}:${Math.floor(now.getTime() / 600_000)}`;
}

export function routePublishedDedupeKey(inspectorId: string, planDateCivil: string): string {
  return `route-published:${inspectorId}:${planDateCivil}`;
}
