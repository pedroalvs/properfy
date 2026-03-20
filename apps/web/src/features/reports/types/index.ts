import type { ReportType, ReportStatus, ReportFormat } from '@properfy/shared';

export interface Report {
  id: string;
  reportType: ReportType;
  status: ReportStatus;
  format: ReportFormat;
  requestedBy: { id: string; name: string };
  fileName: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ReportDetail extends Report {
  parameters: string | null;
  fileSize?: number | null;
}

export interface ReportFiltersState {
  reportType: string;
  status: string;
}

export const DEFAULT_FILTERS: ReportFiltersState = {
  reportType: '',
  status: '',
};
