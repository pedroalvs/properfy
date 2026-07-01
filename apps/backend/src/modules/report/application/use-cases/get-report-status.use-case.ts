import type { IReportRepository } from '../../domain/report.repository';
import type { IReportStorageService } from '../../domain/report-storage.service';
import { PRESIGNED_URL_TTL_SECONDS } from '../../domain/report.constants';
import { ReportNotFoundError, ReportForbiddenError } from '../../domain/report.errors';

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
  filters: Record<string, unknown>;
  rowCount: number | null;
  requestedBy: { id: string; name: string };
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  expiresAt: Date | null;
  errorMessage: string | null;
  fileUrl: string | null;
}

export class GetReportStatusUseCase {
  constructor(
    private readonly reportRepo: IReportRepository,
    private readonly userReader?: UserReader,
    private readonly storageService?: IReportStorageService,
  ) {}

  async execute(reportId: string, auth: AuthContext): Promise<GetReportStatusOutput> {
    const report = await this.reportRepo.findById(reportId);

    if (!report) {
      throw new ReportNotFoundError();
    }

    // Access control: reports are restricted to operators (AM/OP).
    if (auth.role !== 'AM' && auth.role !== 'OP') {
      throw new ReportForbiddenError();
    }

    // Resolve user name for requestedBy
    let userName = 'Unknown';
    if (this.userReader) {
      const user = await this.userReader.findById(report.requestedByUserId);
      if (user) userName = user.name;
    }

    let fileUrl: string | null = null;
    if (this.storageService && report.status === 'READY' && report.fileKey) {
      try {
        fileUrl = await this.storageService.generatePresignedGetUrl(report.fileKey, PRESIGNED_URL_TTL_SECONDS);
      } catch {
        fileUrl = null;
      }
    }

    return {
      id: report.id,
      reportType: report.reportType,
      status: report.status,
      filters: report.filtersJson,
      rowCount: report.rowCount,
      requestedBy: { id: report.requestedByUserId, name: userName },
      createdAt: report.createdAt,
      startedAt: report.startedAt,
      completedAt: report.completedAt,
      failedAt: report.failedAt,
      expiresAt: report.expiresAt,
      errorMessage: report.errorMessage,
      fileUrl,
    };
  }
}
