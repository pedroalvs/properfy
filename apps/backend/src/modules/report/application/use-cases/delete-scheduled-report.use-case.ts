import type { IScheduledReportRepository } from '../../domain/scheduled-report.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ScheduledReportEntity } from '../../domain/scheduled-report.entity';
import {
  ScheduleForbiddenError,
  ScheduledReportNotFoundError,
} from '../../domain/report.errors';
import type { AuthContext } from '@properfy/shared';

/**
 * Feature 019: soft-delete a schedule. Sets `deletedAt`, prevents future runs,
 * preserves past runs for audit/history. Audited.
 */
export class DeleteScheduledReportUseCase {
  constructor(
    private readonly scheduleRepo: IScheduledReportRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(id: string, auth: AuthContext): Promise<void> {
    const schedule = await this.scheduleRepo.findById(id);
    if (!schedule) {
      throw new ScheduledReportNotFoundError();
    }

    this.assertAccess(schedule, auth);

    schedule.softDelete();
    await this.scheduleRepo.update(schedule);

    this.auditService.log({
      tenantId: schedule.tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      entityType: 'ScheduledReport',
      entityId: schedule.id,
      action: 'scheduledReportDeleted',
      before: { status: 'ACTIVE', deletedAt: null },
      after: { status: 'PAUSED', deletedAt: schedule.deletedAt },
    });
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
