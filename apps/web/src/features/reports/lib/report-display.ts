import type { Report, ReportDetail } from '../types';
import { APPOINTMENT_STATUS_MAP } from '@/lib/status-colors';
import type { AppointmentStatus } from '@properfy/shared';

type ReportWithFileKey = Pick<Report, 'id' | 'fileKey'>;

function toTitleCase(value: string): string {
  return value
    .replace(/[._-]/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Formats a civil date ('YYYY-MM-DD') without a timezone shift. */
function formatCivilDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

/**
 * W6 #406: explicit label map for known report filter keys. Raw-ID keys
 * (tenantId/branchId) cannot be resolved client-side and are omitted per the
 * no-raw-IDs rule; unknown keys are omitted rather than dumped as camelCase.
 */
const FILTER_LABELS: Record<string, (value: unknown) => string | null> = {
  fromDate: (v) => `From: ${formatCivilDate(String(v))}`,
  toDate: (v) => `To: ${formatCivilDate(String(v))}`,
  status: (v) =>
    `Status: ${APPOINTMENT_STATUS_MAP[v as AppointmentStatus]?.label ?? toTitleCase(String(v))}`,
  dateAxis: (v) => `Date basis: ${toTitleCase(String(v))}`,
  suburb: (v) => `Suburb: ${String(v)}`,
  groupProperties: (v) => (v ? 'Grouped by property' : null),
};

export function getReportFileName(report: ReportWithFileKey): string | null {
  if (!report.fileKey) {
    return null;
  }

  const segments = report.fileKey.split('/');
  return segments[segments.length - 1] ?? null;
}

export function getReportDownloadName(report: ReportWithFileKey): string {
  return getReportFileName(report) ?? `report-${report.id}.xlsx`;
}

export function formatReportFilters(report: Pick<ReportDetail, 'filters'>): string {
  if (!report.filters || typeof report.filters !== 'object') {
    return '—';
  }

  const parts: string[] = [];
  for (const [key, value] of Object.entries(report.filters)) {
    if (value == null) continue;
    if (typeof value === 'string' && value.trim().length === 0) continue;
    const handler = FILTER_LABELS[key];
    if (!handler) continue; // omit raw-ID and unknown keys
    const label = handler(value);
    if (label) parts.push(label);
  }

  return parts.length > 0 ? parts.join(', ') : '—';
}
