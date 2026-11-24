/**
 * Lock-screen-safe notice text for ROUTE_PUBLISHED (F02, R-F02).
 * Only date, count, time and suburb — never a contact name/phone, key/lockbox
 * code, meeting location or full address. Times are in the plan timezone.
 */
import { formatShortDayLabel } from '@properfy/shared';

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

function fmtDate(date: Date, tz: string): string {
  // Assembled from parts (`formatShortDayLabel`) so the label is identical on
  // every ICU/Node build — the default Intl short-date pattern varies the
  // weekday/day separator ("Thu, 5 Nov" vs "Thu 5 Nov") between versions, which
  // would make this lock-screen body non-deterministic.
  return formatShortDayLabel(date, tz);
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

export function routePublishedDedupeKey(inspectorId: string, planDateCivil: string): string {
  return `route-published:${inspectorId}:${planDateCivil}`;
}
