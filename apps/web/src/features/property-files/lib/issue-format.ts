import { PropertyIssueSource, formatInstantDateTime } from '@properfy/shared';
import type { PropertyIssueResponse } from '@properfy/shared';

/**
 * Display label for an issue's origin. The F10-1 DTO carries only user **ids**
 * (no names), so the card uses the source label as the author indicator — a raw
 * id is never rendered (project rule: no raw ids in UI). See spec Assumption A2.
 */
export function issueSourceLabel(source: PropertyIssueSource): string {
  switch (source) {
    case PropertyIssueSource.INSPECTOR:
      return 'Inspector';
    case PropertyIssueSource.STAFF:
      return 'Staff';
    case PropertyIssueSource.RENTAL_TENANT_PORTAL:
      return 'Tenant';
    default:
      return 'Staff';
  }
}

export interface IssueSeenStatus {
  /** True when the issue has been marked seen. */
  seen: boolean;
  /** Human text, e.g. "Seen · 07/11/2026, 2:30 pm" (+ " · by you"). Empty when unseen. */
  label: string;
}

/**
 * Seen status for an issue card. When seen, renders the timestamp in the
 * platform (Sydney) timezone via the shared helper (never the browser tz) and
 * appends "· by you" when the viewer is the one who marked it. The viewer's
 * name for an issue marked by someone else is not in the contract (ids only), so
 * only "by you" is personalised — otherwise the fact + time suffice (A2).
 */
export function issueSeenStatus(
  issue: Pick<PropertyIssueResponse, 'seenAt' | 'seenByUserId'>,
  currentUserId: string | null,
): IssueSeenStatus {
  if (!issue.seenAt) return { seen: false, label: '' };
  const when = formatInstantDateTime(issue.seenAt);
  const byYou = currentUserId != null && issue.seenByUserId === currentUserId;
  return { seen: true, label: byYou ? `Seen · ${when} · by you` : `Seen · ${when}` };
}

/**
 * Text when an issue has no visible photos. The F10-1 list reads exclude purged
 * photos with no count/flag, so the web cannot distinguish "never had photos"
 * from "photos purged by retention" — it shows "No photos" for both. The D27
 * "Photo removed (retention)" state is not derivable from the current contract
 * (would require the backend to surface a purged-photo count — out of F10-2
 * scope). See spec Assumption A9.
 */
export const ISSUE_NO_PHOTOS_TEXT = 'No photos';
