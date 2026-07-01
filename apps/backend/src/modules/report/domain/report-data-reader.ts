import type { ReportDateAxis } from '@properfy/shared';

export interface ReportDataFilters {
  fromDate: string;
  toDate: string;
  /**
   * Which appointment timestamp the Period applies to. Ignored by the Financial
   * report, which ranges on `financial_entries.effective_at`.
   */
  dateAxis: ReportDateAxis;
  /** Agency scope (SaaS tenant). */
  tenantId?: string;
  branchId?: string;
  /** Case-insensitive match against `property.suburb`. */
  suburb?: string;
  /** Appointment status — narrows the Appointments report. */
  status?: string;
  /** When true, Appointments rows are ordered so each property's rows are contiguous. */
  groupProperties?: boolean;
}

/**
 * Read port for the 4 scoped report types. Each method returns denormalized rows
 * ready for the XLSX generator.
 */
export interface IReportDataReader {
  getAppointmentRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]>;
  getFinancialRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]>;
  getPerformanceRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]>;
  getAgencyRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]>;
}
