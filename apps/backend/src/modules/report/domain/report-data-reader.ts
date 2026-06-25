export interface ReportDataFilters {
  fromDate: string;
  toDate: string;
  tenantId?: string;
  serviceTypeId?: string;
  branchId?: string;
  inspectorId?: string;
  status?: string;
  tenantConfirmationStatus?: string;
  search?: string;
  emailNotificationStatus?: string;
}

export interface IReportDataReader {
  getInspectionRows(filters: ReportDataFilters, appointmentStatus: string): Promise<Record<string, unknown>[]>;
  getInspectorPerformanceRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]>;
  getConfirmationStatusRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]>;
  getFinancialServicesRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]>;
}
