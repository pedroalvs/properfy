import type { IScheduledReportRepository } from '../../domain/scheduled-report.repository';
import type { RequestReportUseCase } from '../../application/use-cases/request-report.use-case';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { getNextRunTime } from '../../domain/cron-parser';
import type { AuthContext, ReportType, ReportFormat } from '@properfy/shared';

export class ProcessSchedulesWorker {
  constructor(
    private readonly scheduledReportRepo: IScheduledReportRepository,
    private readonly requestReportUseCase: RequestReportUseCase,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<{ processedCount: number; failedCount: number }> {
    const now = new Date();
    const dueSchedules = await this.scheduledReportRepo.findDueSchedules(now);

    let processedCount = 0;
    let failedCount = 0;

    for (const schedule of dueSchedules) {
      try {
        // Build filters with a sensible date range based on the schedule frequency
        const filters = this.buildFiltersForSchedule(schedule.filtersJson, now);

        // Create a synthetic auth context for the scheduled job
        const auth: AuthContext = {
          userId: schedule.createdByUserId,
          tenantId: schedule.tenantId,
          role: 'AM', // Scheduled reports run with AM privileges since only AM/OP can create them
          branchId: null,
          inspectorId: null,
          clUserPermissions: [],
        };

        await this.requestReportUseCase.execute(
          {
            reportType: schedule.reportType as ReportType,
            filters: {
              fromDate: filters.fromDate,
              toDate: filters.toDate,
              tenantId: schedule.tenantId,
              ...this.extractOptionalFilters(schedule.filtersJson),
            },
            format: (schedule.format as ReportFormat) ?? 'XLSX',
          },
          auth,
        );

        // Compute next run time and update
        const nextRunAt = getNextRunTime(schedule.cronExpression, now);
        schedule.markRun(now, nextRunAt!);
        await this.scheduledReportRepo.update(schedule);

        processedCount++;
        this.logger.info(
          { scheduleId: schedule.id, nextRunAt },
          'Processed scheduled report',
        );
      } catch (err) {
        failedCount++;
        this.logger.error(
          { scheduleId: schedule.id, error: err },
          'Failed to process scheduled report',
        );
      }
    }

    this.logger.info(
      { processedCount, failedCount, total: dueSchedules.length },
      'Scheduled report processing completed',
    );

    return { processedCount, failedCount };
  }

  /**
   * Build date range filters based on the schedule.
   * Default: last 30 days up to now.
   */
  private buildFiltersForSchedule(
    filtersJson: Record<string, unknown>,
    now: Date,
  ): { fromDate: string; toDate: string } {
    // If the schedule has explicit date range markers, respect them
    if (typeof filtersJson.rangeDays === 'number') {
      const fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - (filtersJson.rangeDays as number));
      return {
        fromDate: this.formatDate(fromDate),
        toDate: this.formatDate(now),
      };
    }

    // Default: last 30 days
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - 30);
    return {
      fromDate: this.formatDate(fromDate),
      toDate: this.formatDate(now),
    };
  }

  private extractOptionalFilters(filtersJson: Record<string, unknown>): Record<string, string | undefined> {
    const optional: Record<string, string | undefined> = {};
    if (typeof filtersJson.serviceTypeId === 'string') optional.serviceTypeId = filtersJson.serviceTypeId;
    if (typeof filtersJson.branchId === 'string') optional.branchId = filtersJson.branchId;
    if (typeof filtersJson.inspectorId === 'string') optional.inspectorId = filtersJson.inspectorId;
    if (typeof filtersJson.status === 'string') optional.status = filtersJson.status;
    return optional;
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
