import type { IReportRepository } from '../../domain/report.repository';
import { ReportNotFoundError } from '../../domain/report.errors';

export interface AuthContext {
  userId: string;
  tenantId: string | null;
  role: string;
}

interface UserReader {
  findById(id: string): Promise<{ id: string; name: string } | null>;
}

export interface GetReportStatusOutput {
  id: string;
  reportType: string;
  status: string;
  format: string;
  filters: Record<string, unknown>;
  rowCount: number | null;
  requestedBy: { id: string; name: string };
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  expiresAt: Date | null;
  errorMessage: string | null;
}

export class GetReportStatusUseCase {
  constructor(
    private readonly reportRepo: IReportRepository,
    private readonly userReader?: UserReader,
  ) {}

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

    // Resolve user name for requestedBy
    let userName = 'Unknown';
    if (this.userReader) {
      const user = await this.userReader.findById(report.requestedByUserId);
      if (user) userName = user.name;
    }

    return {
      id: report.id,
      reportType: report.reportType,
      status: report.status,
      format: report.format,
      filters: report.filtersJson,
      rowCount: report.rowCount,
      requestedBy: { id: report.requestedByUserId, name: userName },
      createdAt: report.createdAt,
      startedAt: report.startedAt,
      completedAt: report.completedAt,
      failedAt: report.failedAt,
      expiresAt: report.expiresAt,
      errorMessage: isOperator ? report.errorMessage : null,
    };
  }
}
