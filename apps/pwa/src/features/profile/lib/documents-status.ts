import { todayInTzDateString } from '@properfy/shared';

/**
 * Aggregate compliance status for the inspector's documents (insurance + police
 * check), surfaced as a glanceable tone + label on the Profile tile.
 *
 * Dates are compared as civil calendar days, never instants: `new Date('2026-03-18')`
 * is UTC midnight, which is mid-morning in Sydney, so an instant compare flips a
 * badge to "expired" on the expiry day itself. This mirrors the per-document logic
 * in {@link InspectorDetailsCard} (`ExpiryBadge`).
 */
export type DocumentsTone = 'good' | 'warning' | 'danger';

export interface DocumentsStatus {
  tone: DocumentsTone;
  label: string;
}

export interface DocumentsStatusInput {
  insuranceFileKey?: string | null;
  insuranceMetaJson?: unknown;
  insuranceExpiresAt?: string | null;
  policeCheckFileKey?: string | null;
  policeCheckMetaJson?: unknown;
  policeCheckExpiresAt?: string | null;
}

type ExpiryState = 'none' | 'ok' | 'soon' | 'expired';

/** Local calendar day of a Date, as YYYY-MM-DD. */
function toIsoDay(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Classifies an expiry date against "today" in the given timezone, as civil days. */
function classifyExpiry(expiry: string | null | undefined, timeZone: string): ExpiryState {
  if (!expiry) return 'none';
  const today = todayInTzDateString(timeZone);
  const expiryDay = expiry.slice(0, 10);
  if (expiryDay < today) return 'expired';
  const soonCutoff = new Date(`${today}T12:00:00`);
  soonCutoff.setDate(soonCutoff.getDate() + 30);
  return expiryDay <= toIsoDay(soonCutoff) ? 'soon' : 'ok';
}

/**
 * Collapses the two tracked documents into one status:
 * - `danger` ("Action needed") when either is missing or already expired;
 * - `warning` ("N expiring") when one or both expire within 30 days;
 * - `good` ("All on file") otherwise.
 */
export function getDocumentsStatus(inspector: DocumentsStatusInput, timeZone: string): DocumentsStatus {
  const docs = [
    {
      onFile: Boolean(inspector.insuranceFileKey || inspector.insuranceMetaJson),
      state: classifyExpiry(inspector.insuranceExpiresAt, timeZone),
    },
    {
      onFile: Boolean(inspector.policeCheckFileKey || inspector.policeCheckMetaJson),
      state: classifyExpiry(inspector.policeCheckExpiresAt, timeZone),
    },
  ];

  const anyMissing = docs.some((d) => !d.onFile);
  const anyExpired = docs.some((d) => d.state === 'expired');
  if (anyMissing || anyExpired) return { tone: 'danger', label: 'Action needed' };

  const soonCount = docs.filter((d) => d.state === 'soon').length;
  if (soonCount > 0) return { tone: 'warning', label: `${soonCount} expiring` };

  return { tone: 'good', label: 'All on file' };
}
