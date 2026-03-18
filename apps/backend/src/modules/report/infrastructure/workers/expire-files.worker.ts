import type { IReportRepository } from '../../domain/report.repository';
import type { IReportStorageService } from '../../domain/report-storage.service';
import type { Logger } from '../../../../shared/infrastructure/logger';

export class ExpireFilesWorker {
  constructor(
    private readonly reportRepo: IReportRepository,
    private readonly storageService: IReportStorageService,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<{ expiredCount: number }> {
    const expiredReports = await this.reportRepo.findExpiredWithFileKey();
    let expiredCount = 0;

    for (const report of expiredReports) {
      try {
        await this.storageService.deleteObject(report.fileKey!);
        report.fileKey = null;
        report.updatedAt = new Date();
        await this.reportRepo.update(report);
        expiredCount++;
      } catch (err) {
        this.logger.error({ reportId: report.id, error: err }, 'Failed to expire report file');
      }
    }

    this.logger.info({ expiredCount, total: expiredReports.length }, 'Report file expiry completed');
    return { expiredCount };
  }
}
