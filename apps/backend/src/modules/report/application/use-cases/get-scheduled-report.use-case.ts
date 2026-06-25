import type { IScheduledReportRepository } from '../../domain/scheduled-report.repository';
import type { IScheduledReportRunRepository } from '../../domain/scheduled-report-run.repository';
import type { ScheduledReportEntity } from '../../domain/scheduled-report.entity';
import type { ScheduleRunStatus } from '@properfy/shared';
import {
  ScheduleForbiddenError,
  ScheduledReportNotFoundError,
} from '../../domain/report.errors';
import type { AuthContext } from '@properfy/shared';

export interface GetScheduledReportOutput extends ScheduledReportEntity {
  lastRunStatus: ScheduleRunStatus | null;
}

/**
 * Feature 019 US4: single-schedule detail endpoint with the latest run status.
 */
export class GetScheduledReportUseCase {
  constructor(
    private readonly scheduleRepo: IScheduledReportRepository,
    private readonly runRepo: IScheduledReportRunRepository,
  ) {}

  async execute(
    id: string,
    auth: AuthContext,
  ): Promise<{ schedule: ScheduledReportEntity; lastRunStatus: ScheduleRunStatus | null }> {
    const schedule = await this.scheduleRepo.findById(id);
    if (!schedule) {
      throw new ScheduledReportNotFoundError();
    }

    this.assertAccess(schedule, auth);

    const lastRun = await this.runRepo.findLatestForSchedule(id);
    return { schedule, lastRunStatus: lastRun?.status ?? null };
  }

  private assertAccess(schedule: ScheduledReportEntity, auth: AuthContext): void {
    if (auth.role === 'AM') return;
    if (schedule.tenantId !== auth.tenantId) {
      throw new ScheduleForbiddenError();
    }
    if (auth.role === 'OP' || auth.role === 'CL_ADMIN') return;
    if (auth.role === 'CL_USER' && schedule.createdByUserId === auth.userId) return;
    throw new ScheduleForbiddenError();
  }
}
