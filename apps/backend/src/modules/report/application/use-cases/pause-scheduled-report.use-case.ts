import type { IScheduledReportRepository } from '../../domain/scheduled-report.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ScheduledReportEntity } from '../../domain/scheduled-report.entity';
import {
  ScheduleForbiddenError,
  ScheduledReportNotFoundError,
} from '../../domain/report.errors';
import type { AuthContext } from '@properfy/shared';

export interface PauseScheduledReportInput {
  id: string;
  reason?: string;
}

/**
 * Feature 019: transitions a schedule to PAUSED. Idempotent. Audited.
 */
export class PauseScheduledReportUseCase {
  constructor(
    private readonly scheduleRepo: IScheduledReportRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(
    input: PauseScheduledReportInput,
    auth: AuthContext,
  ): Promise<ScheduledReportEntity> {
    const schedule = await this.scheduleRepo.findById(input.id);
    if (!schedule) {
      throw new ScheduledReportNotFoundError();
    }

    this.assertAccess(schedule, auth);

    if (schedule.status === 'PAUSED') {
      return schedule; // idempotent
    }

    const before = { status: schedule.status };
    schedule.pause();
    await this.scheduleRepo.update(schedule);

    this.auditService.log({
      tenantId: schedule.tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      entityType: 'ScheduledReport',
      entityId: schedule.id,
      action: 'scheduledReportPaused',
      reason: input.reason,
      before,
      after: { status: schedule.status },
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
