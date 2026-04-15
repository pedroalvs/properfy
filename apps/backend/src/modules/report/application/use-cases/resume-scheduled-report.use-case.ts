import type { IScheduledReportRepository } from '../../domain/scheduled-report.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ScheduledReportEntity } from '../../domain/scheduled-report.entity';
import {
  ScheduleForbiddenError,
  ScheduledReportNotFoundError,
} from '../../domain/report.errors';
import { getNextRunTime } from '../../domain/cron-parser';
import type { AuthContext } from '@properfy/shared';

/**
 * Feature 019: transitions a schedule to ACTIVE and resets the consecutive
 * failure counter. Recomputes `nextRunAt` from the current cron expression so
 * the paused interval is not replayed. Idempotent. Audited.
 */
export class ResumeScheduledReportUseCase {
  constructor(
    private readonly scheduleRepo: IScheduledReportRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(id: string, auth: AuthContext): Promise<ScheduledReportEntity> {
    const schedule = await this.scheduleRepo.findById(id);
    if (!schedule) {
      throw new ScheduledReportNotFoundError();
    }

    this.assertAccess(schedule, auth);

    if (schedule.status === 'ACTIVE') {
      return schedule; // idempotent
    }

    const before = { status: schedule.status, consecutiveFailureCount: schedule.consecutiveFailureCount };
    const nextRunAt = getNextRunTime(schedule.cronExpression, new Date());
    schedule.resume(nextRunAt);
    await this.scheduleRepo.update(schedule);

    this.auditService.log({
      tenantId: schedule.tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      entityType: 'ScheduledReport',
      entityId: schedule.id,
      action: 'scheduledReportResumed',
      before,
      after: { status: schedule.status, consecutiveFailureCount: 0, nextRunAt },
    });

    return schedule;
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
