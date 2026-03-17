import type { ReportType, ReportStatus, ReportFormat } from '@properfy/shared';

export interface Report {
  id: string;
  reportType: ReportType;
  status: ReportStatus;
  format: ReportFormat;
  requestedByName: string;
  fileName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportDetail extends Report {
  parameters: string | null;
  fileSize: number | null;
}

export interface ReportFiltersState {
  reportType: string;
  status: string;
}

export const DEFAULT_FILTERS: ReportFiltersState = {
  reportType: '',
  status: '',
};
