import type { IReportRepository } from '../../domain/report.repository';
import { ReportNotFoundError } from '../../domain/report.errors';

export interface AuthContext {
  userId: string;
  tenantId: string | null;
  role: string;
}

export interface GetReportStatusOutput {
  id: string;
  reportType: string;
  status: string;
  format: string;
  filters: Record<string, unknown>;
  rowCount: number | null;
  requestedByUserId: string;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  expiresAt: Date | null;
  errorMessage: string | null;
}

export class GetReportStatusUseCase {
  constructor(private readonly reportRepo: IReportRepository) {}

  async execute(reportId: string, auth: AuthContext): Promise<GetReportStatusOutput> {
    const report = await this.reportRepo.findById(reportId);

    if (!report) {
      throw new ReportNotFoundError();
    }

    // Access control: AM/OP can access any; others only own reports
    if (auth.role !== 'AM' && auth.role !== 'OP') {
      if (report.requestedByUserId !== auth.userId) {
        throw new ReportNotFoundError();
      }
    }

    const isOperator = auth.role === 'AM' || auth.role === 'OP';

    return {
      id: report.id,
      reportType: report.reportType,
      status: report.status,
      format: report.format,
      filters: report.filtersJson,
      rowCount: report.rowCount,
      requestedByUserId: report.requestedByUserId,
      createdAt: report.createdAt,
      startedAt: report.startedAt,
      completedAt: report.completedAt,
      failedAt: report.failedAt,
      expiresAt: report.expiresAt,
      errorMessage: isOperator ? report.errorMessage : null,
    };
  }
}
