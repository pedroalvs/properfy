import type { Report, ReportDetail } from '../types';

type ReportWithFileKey = Pick<Report, 'id' | 'fileKey'>;

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

  const entries = Object.entries(report.filters).filter(([, value]) => {
    if (value == null) {
      return false;
    }

    if (typeof value === 'string') {
      return value.trim().length > 0;
    }

    return true;
  });

  if (entries.length === 0) {
    return '—';
  }

  return entries
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ');
}
