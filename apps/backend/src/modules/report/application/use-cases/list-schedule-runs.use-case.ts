import type { IScheduledReportRepository } from '../../domain/scheduled-report.repository';
import type { IScheduledReportRunRepository } from '../../domain/scheduled-report-run.repository';
import type { ScheduledReportRunEntity } from '../../domain/scheduled-report-run.entity';
import type { ScheduledReportEntity } from '../../domain/scheduled-report.entity';
import {
  ScheduleForbiddenError,
  ScheduledReportNotFoundError,
} from '../../domain/report.errors';
import type { AuthContext } from '@properfy/shared';

/**
 * Feature 019 US4: paginated run history for a given schedule. RBAC mirrors the
 * parent schedule.
 */
export class ListScheduleRunsUseCase {
  constructor(
    private readonly scheduleRepo: IScheduledReportRepository,
    private readonly runRepo: IScheduledReportRunRepository,
  ) {}

  async execute(
    params: { scheduleId: string; page: number; pageSize: number },
    auth: AuthContext,
  ): Promise<{ data: ScheduledReportRunEntity[]; meta: { total: number } }> {
    const schedule = await this.scheduleRepo.findById(params.scheduleId);
    if (!schedule) {
      throw new ScheduledReportNotFoundError();
    }
    this.assertAccess(schedule, auth);

    const [data, total] = await Promise.all([
      this.runRepo.findByScheduleId(params.scheduleId, params.page, params.pageSize),
      this.runRepo.countByScheduleId(params.scheduleId),
    ]);

    return { data, meta: { total } };
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
