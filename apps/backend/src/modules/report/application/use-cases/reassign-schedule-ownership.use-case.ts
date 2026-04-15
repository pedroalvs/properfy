import type { IScheduledReportRepository } from '../../domain/scheduled-report.repository';
import type { IUserManagementRepository } from '../../../user/domain/user-management.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ScheduledReportEntity } from '../../domain/scheduled-report.entity';
import {
  ScheduleForbiddenReassignmentError,
  ScheduledReportNotFoundError,
  IncompatibleOwnershipError,
} from '../../domain/report.errors';
import { RESTRICTED_REPORT_TYPES } from '../../domain/report.constants';
import type { AuthContext } from '@properfy/shared';

export interface ReassignScheduleOwnershipInput {
  scheduleId: string;
  newOwnerUserId: string;
  reason: string;
}

/**
 * Feature 019 US5: AM-only reassignment of a schedule's ownership to another
 * user. The target user must be active, in the same tenant, and have compatible
 * permissions for the schedule's report type. Audited with before/after.
 *
 * No automatic transfer occurs when owners are deactivated — AMs explicitly
 * reassign. The schedule stays paused until reassigned (the worker auto-pauses
 * on deactivated owner at the next tick).
 */
export class ReassignScheduleOwnershipUseCase {
  constructor(
    private readonly scheduleRepo: IScheduledReportRepository,
    private readonly userRepo: IUserManagementRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(
    input: ReassignScheduleOwnershipInput,
    auth: AuthContext,
  ): Promise<ScheduledReportEntity> {
    if (auth.role !== 'AM') {
      throw new ScheduleForbiddenReassignmentError();
    }

    const schedule = await this.scheduleRepo.findById(input.scheduleId);
    if (!schedule) {
      throw new ScheduledReportNotFoundError();
    }

    const targetUser = await this.userRepo.findById(input.newOwnerUserId);
    if (!targetUser) {
      throw new IncompatibleOwnershipError(input.newOwnerUserId, 'user not found');
    }
    if (!targetUser.isActive()) {
      throw new IncompatibleOwnershipError(input.newOwnerUserId, 'user inactive');
    }
    if (targetUser.tenantId !== null && targetUser.tenantId !== schedule.tenantId) {
      throw new IncompatibleOwnershipError(input.newOwnerUserId, 'wrong tenant');
    }
    if (
      RESTRICTED_REPORT_TYPES.includes(schedule.reportType) &&
      targetUser.role !== 'AM' &&
      targetUser.role !== 'OP'
    ) {
      throw new IncompatibleOwnershipError(
        input.newOwnerUserId,
        'restricted report type requires AM or OP',
      );
    }
    if (targetUser.role === 'INSP' || targetUser.role === 'TNT') {
      throw new IncompatibleOwnershipError(input.newOwnerUserId, 'role cannot own schedules');
    }

    const before = { ownerUserId: schedule.createdByUserId };
    schedule.createdByUserId = input.newOwnerUserId;
    schedule.updatedAt = new Date();
    await this.scheduleRepo.update(schedule);

    this.auditService.log({
      tenantId: schedule.tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      entityType: 'ScheduledReport',
      entityId: schedule.id,
      action: 'scheduledReportOwnershipReassigned',
      reason: input.reason,
      before,
      after: { ownerUserId: schedule.createdByUserId },
    });

    return schedule;
  }
}
