import type { IReportRepository } from '../../domain/report.repository';
import type { IReportStorageService } from '../../domain/report-storage.service';
import {
  ReportNotFoundError,
  ReportNotReadyError,
  ReportExpiredError,
  ReportForbiddenError,
} from '../../domain/report.errors';
import { PRESIGNED_URL_TTL_SECONDS } from '../../domain/report.constants';

export interface AuthContext {
  userId: string;
  tenantId: string | null;
  role: string;
}

export interface DownloadReportOutput {
  downloadUrl: string;
  fileName: string;
  expiresAt: Date;
}

export class DownloadReportUseCase {
  constructor(
    private readonly reportRepo: IReportRepository,
    private readonly storageService: IReportStorageService,
  ) {}

  async execute(reportId: string, auth: AuthContext): Promise<DownloadReportOutput> {
    const report = await this.reportRepo.findById(reportId);

    if (!report) {
      throw new ReportNotFoundError();
    }

    // Access control: reports are restricted to operators (AM/OP).
    if (auth.role !== 'AM' && auth.role !== 'OP') {
      throw new ReportForbiddenError();
    }

    // Must be READY
    if (!report.isReady()) {
      throw new ReportNotReadyError();
    }

    // Must not be expired
    if (report.isExpired()) {
      throw new ReportExpiredError();
    }

    // Defensive: file_key must exist
    if (!report.fileKey) {
      throw new ReportNotFoundError();
    }

    const downloadUrl = await this.storageService.generatePresignedGetUrl(
      report.fileKey,
      PRESIGNED_URL_TTL_SECONDS,
    );

    // Build fileName: {reportType-kebab}-{fromDate}-to-{toDate}.{ext}
    const filters = report.filtersJson as Record<string, string>;
    const reportTypeKebab = report.reportType.toLowerCase().replace(/_/g, '-');
    const fileName = `${reportTypeKebab}-${filters.fromDate}-to-${filters.toDate}.xlsx`;

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + PRESIGNED_URL_TTL_SECONDS);

    return { downloadUrl, fileName, expiresAt };
  }
}
