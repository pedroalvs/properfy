import type { IAppointmentImportRepository } from '../../domain/appointment-import.repository';
import type { IReportStorageService } from '../../../report/domain/report-storage.service';
import type { Logger } from '../../../../shared/infrastructure/logger';

/**
 * Scheduled cleanup: an operator who previews an import but never commits
 * (or abandons the browser tab) leaves a `PREVIEW` row plus its uploaded
 * file behind forever. Deletes both once older than `maxAgeHours`.
 */
export class SweepAbandonedAppointmentImportsWorker {
  constructor(
    private readonly importRepo: IAppointmentImportRepository,
    private readonly storageService: IReportStorageService,
    private readonly logger: Logger,
    private readonly maxAgeHours: number = 24,
  ) {}

  async execute(): Promise<{ sweptCount: number }> {
    const cutoff = new Date(Date.now() - this.maxAgeHours * 60 * 60 * 1000);
    const abandoned = await this.importRepo.findAbandonedPreviews(cutoff);

    let sweptCount = 0;
    for (const record of abandoned) {
      try {
        await this.storageService.deleteObject(record.fileKey);
      } catch (err) {
        // Non-fatal — the file may already be gone; still remove the row.
        this.logger.warn({ importId: record.id, error: err }, 'Failed to delete abandoned import file (continuing)');
      }
      await this.importRepo.deleteById(record.id);
      sweptCount++;
    }

    if (sweptCount > 0) {
      this.logger.info({ sweptCount }, 'Swept abandoned appointment-import previews');
    }
    return { sweptCount };
  }
}
