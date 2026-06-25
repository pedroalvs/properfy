import type { IScheduledReportRepository } from '../../domain/scheduled-report.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ScheduledReportEntity } from '../../domain/scheduled-report.entity';
import {
  ScheduleForbiddenError,
  ScheduledReportNotFoundError,
  InvalidRecurrenceError,
} from '../../domain/report.errors';
import { getNextRunTime, recurrenceToCron, type StructuredRecurrenceInput } from '../../domain/cron-parser';
import type { AuthContext, ScheduleDeliveryMode } from '@properfy/shared';

export interface UpdateScheduledReportInput {
  id: string;
  filtersJson?: Record<string, unknown>;
  recurrence?: StructuredRecurrenceInput;
  deliveryMode?: ScheduleDeliveryMode;
  recipientUserIds?: string[];
  displayName?: string;
  skipDeliveryWhenEmpty?: boolean;
}

/**
 * Feature 019: edit a schedule's filters, recurrence, delivery mode, recipients,
 * display name, or skip-when-empty toggle. Recomputes `nextRunAt` when the
 * recurrence changes. Audited with before/after snapshots.
 */
export class UpdateScheduledReportUseCase {
  constructor(
    private readonly scheduleRepo: IScheduledReportRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateScheduledReportInput, auth: AuthContext): Promise<ScheduledReportEntity> {
    const schedule = await this.scheduleRepo.findById(input.id);
    if (!schedule) {
      throw new ScheduledReportNotFoundError();
    }

    this.assertAccess(schedule, auth);

    const before = snapshot(schedule);

    if (input.filtersJson !== undefined) {
      schedule.filtersJson = input.filtersJson;
    }
    if (input.recurrence !== undefined) {
      const cron = recurrenceToCron(input.recurrence);
      schedule.cronExpression = cron;
      const next = getNextRunTime(cron, new Date());
      if (!next) {
        throw new InvalidRecurrenceError('could not compute next run from recurrence');
      }
      schedule.nextRunAt = next;
    }
    if (input.deliveryMode !== undefined) {
      schedule.deliveryMode = input.deliveryMode;
    }
    if (input.recipientUserIds !== undefined) {
      schedule.recipientUserIds = input.recipientUserIds;
    }
    if (input.displayName !== undefined) {
      schedule.displayName = input.displayName;
    }
    if (input.skipDeliveryWhenEmpty !== undefined) {
      schedule.skipDeliveryWhenEmpty = input.skipDeliveryWhenEmpty;
    }
    schedule.updatedAt = new Date();

    await this.scheduleRepo.update(schedule);

    this.auditService.log({
      tenantId: schedule.tenantId,
      actorType: 'USER',
      actorId: auth.userId,
      entityType: 'ScheduledReport',
      entityId: schedule.id,
      action: 'scheduledReportUpdated',
      before,
      after: snapshot(schedule),
    });

    return schedule;
  }

  private assertAccess(schedule: ScheduledReportEntity, auth: AuthContext): void {
    if (auth.role === 'AM') return;
    if (schedule.tenantId !== auth.tenantId) {
      throw new ScheduleForbiddenError();
    }
    // OP and CL_ADMIN can edit any schedule within their tenant
    if (auth.role === 'OP' || auth.role === 'CL_ADMIN') return;
    // CL_USER can only edit their own schedules
    if (auth.role === 'CL_USER' && schedule.createdByUserId === auth.userId) return;
    throw new ScheduleForbiddenError();
  }
}

function snapshot(schedule: ScheduledReportEntity): Record<string, unknown> {
  return {
    cronExpression: schedule.cronExpression,
    displayName: schedule.displayName,
    deliveryMode: schedule.deliveryMode,
    recipientUserIds: schedule.recipientUserIds,
    skipDeliveryWhenEmpty: schedule.skipDeliveryWhenEmpty,
    filtersJson: schedule.filtersJson,
  };
}
