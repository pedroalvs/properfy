import type { ReportType, ReportStatus, ReportFormat, ReportFilters } from '@properfy/shared';

export interface Report {
  id: string;
  reportType: ReportType;
  status: ReportStatus;
  format: ReportFormat;
  requestedBy: { id: string; name: string };
  fileKey?: string | null;
  filters?: ReportFilters | null;
  scheduledReportId?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface ReportDetail extends Report {
  completedAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  rowCount?: number | null;
  expiresAt?: string | null;
  fileSize?: number | null;
}

export interface ReportFiltersState {
  reportType: string;
  status: string;
  fromDate: string;
  toDate: string;
}

export const DEFAULT_FILTERS: ReportFiltersState = {
  reportType: '',
  status: '',
  fromDate: '',
  toDate: '',
};
