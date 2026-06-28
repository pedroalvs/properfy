import { randomUUID } from 'node:crypto';
import type { IScheduledReportRepository } from '../../domain/scheduled-report.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IUserManagementRepository } from '../../../user/domain/user-management.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { ScheduledReportEntity } from '../../domain/scheduled-report.entity';
import { ForbiddenError } from '../../../../shared/domain/errors';
import {
  InvalidCronExpressionError,
  InvalidReportTypeError,
  ReportTenantScopeViolationError,
  ReportTypeForbiddenError,
  MaxSchedulesPerUserExceededError,
  InvalidRecurrenceError,
  IncompatibleRecipientError,
  EmptyRecipientListError,
} from '../../domain/report.errors';
import {
  parseCronExpression,
  getNextRunTime,
  recurrenceToCron,
  type StructuredRecurrenceInput,
} from '../../domain/cron-parser';
import {
  REPORT_COLUMNS,
  RESTRICTED_REPORT_TYPES,
  MAX_SCHEDULES_PER_USER,
} from '../../domain/report.constants';
import type {
  ReportType,
  ReportFormat,
  AuthContext,
  ScheduleDeliveryMode,
} from '@properfy/shared';

export interface CreateScheduledReportInput {
  reportType: ReportType;
  filtersJson: Record<string, unknown>;
  format: ReportFormat;
  /** Feature 019: structured recurrence (preferred). */
  recurrence?: StructuredRecurrenceInput;
  /** @deprecated — accepted for back-compat; ignored when `recurrence` is provided. */
  cronExpression?: string;
  deliveryMode: ScheduleDeliveryMode;
  recipientUserIds: string[];
  displayName?: string;
  skipDeliveryWhenEmpty: boolean;
  /** AM only: explicit tenant scope when JWT tenantId is null. */
  tenantId?: string;
}

export interface CreateScheduledReportOutput {
  id: string;
  reportType: ReportType;
  cronExpression: string;
  displayName: string | null;
  deliveryMode: ScheduleDeliveryMode;
  recipientUserIds: string[];
  skipDeliveryWhenEmpty: boolean;
  status: 'ACTIVE' | 'PAUSED';
  nextRunAt: Date | null;
  createdAt: Date;
}

/**
 * Feature 019: broadened create use case.
 *
 * RBAC:
 *   - AM: any tenant, any report type
 *   - OP: own tenant, any report type (restricted types allowed within own tenant)
 *   - CL_ADMIN: own tenant, any report type available to their tenant (restricted types forbidden)
 *   - CL_USER: own tenant + `export_reports` permission, restricted types forbidden
 *   - INSP / TNT: forbidden
 *
 * Limits:
 *   - max 10 active schedules per user (FR-034)
 *   - min 1-day recurrence (enforced by the structured recurrence schema — only daily/weekly/monthly allowed)
 */
export class CreateScheduledReportUseCase {
  constructor(
    private readonly scheduledReportRepo: IScheduledReportRepository,
    private readonly auditService: AuditService,
    private readonly userRepo?: IUserManagementRepository,
    private readonly authorizationService?: AuthorizationService,
  ) {}

  async execute(
    input: CreateScheduledReportInput,
    auth: AuthContext,
  ): Promise<CreateScheduledReportOutput> {
    const {
      reportType,
      filtersJson,
      format,
      recurrence,
      cronExpression: legacyCron,
      deliveryMode,
      recipientUserIds,
      displayName,
      skipDeliveryWhenEmpty,
      tenantId: inputTenantId,
    } = input;
    const { userId, tenantId, role } = auth;

    // 1. RBAC: which roles can create any schedule?
    if (role !== 'AM' && role !== 'OP' && role !== 'CL_ADMIN' && role !== 'CL_USER') {
      throw new ForbiddenError('FORBIDDEN', 'Role not permitted to create scheduled reports');
    }

    // 1b. CL_USER must have the export_reports permission
    if (role === 'CL_USER') {
      if (!tenantId) {
        throw new ForbiddenError('FORBIDDEN', 'Missing tenant context');
      }
      if (this.authorizationService) {
        this.authorizationService.assertClUserPermission(auth, 'export_reports');
      }
    }

    // 1c. Restricted report types can only be scheduled by AM/OP
    if (RESTRICTED_REPORT_TYPES.includes(reportType) && role !== 'AM' && role !== 'OP') {
      throw new ReportTypeForbiddenError();
    }

    // 2. Validate report type
    if (!REPORT_COLUMNS[reportType]) {
      throw new InvalidReportTypeError(reportType);
    }

    // 3. Resolve the cron expression from the structured recurrence (preferred)
    //    or the legacy field. This is the canonical storage format.
    let cronExpression: string;
    if (recurrence) {
      cronExpression = recurrenceToCron(recurrence);
    } else if (legacyCron) {
      try {
        parseCronExpression(legacyCron);
      } catch (err) {
        throw new InvalidCronExpressionError((err as Error).message);
      }
      cronExpression = legacyCron;
    } else {
      throw new InvalidRecurrenceError('recurrence or cronExpression is required');
    }

    // 4. Determine effective tenant
    let effectiveTenantId: string;
    if (role === 'AM') {
      // AM has null tenantId in JWT; accept tenantId from the request body (Pattern B),
      // falling back to filtersJson.tenantId for legacy callers.
      effectiveTenantId = inputTenantId ?? (filtersJson.tenantId as string | undefined) ?? tenantId ?? '';
      if (!effectiveTenantId) {
        throw new ForbiddenError('FORBIDDEN', 'Scheduled reports require a tenant context');
      }
    } else {
      // OP / CL_ADMIN / CL_USER: force own tenant
      if (filtersJson.tenantId && tenantId && filtersJson.tenantId !== tenantId) {
        throw new ReportTenantScopeViolationError();
      }
      effectiveTenantId = tenantId ?? (filtersJson.tenantId as string) ?? '';
      if (!effectiveTenantId) {
        throw new ForbiddenError('FORBIDDEN', 'Scheduled reports require a tenant context');
      }
    }

    // 5. Enforce max schedules per user
    const activeCount = await this.scheduledReportRepo.countActiveByOwner(userId);
    if (activeCount >= MAX_SCHEDULES_PER_USER) {
      throw new MaxSchedulesPerUserExceededError(MAX_SCHEDULES_PER_USER);
    }

    // 6. Validate recipients for RECIPIENT_LIST mode (sanity check at create time;
    //    final validation happens at delivery time in DeliverScheduledReportUseCase)
    if (deliveryMode === 'RECIPIENT_LIST') {
      if (!recipientUserIds || recipientUserIds.length === 0) {
        throw new EmptyRecipientListError();
      }
      if (this.userRepo) {
        for (const recipientId of recipientUserIds) {
          const user = await this.userRepo.findById(recipientId);
          if (!user) {
            throw new IncompatibleRecipientError(recipientId, 'user not found');
          }
          if (user.tenantId !== effectiveTenantId) {
            throw new IncompatibleRecipientError(recipientId, 'wrong tenant');
          }
          if (!user.isActive()) {
            throw new IncompatibleRecipientError(recipientId, 'user inactive');
          }
        }
      }
    }

    // 7. Compute next run time
    const now = new Date();
    const nextRunAt = getNextRunTime(cronExpression, now);

    // 8. Create entity
    const id = randomUUID();
    const entity = new ScheduledReportEntity({
      id,
      tenantId: effectiveTenantId,
      reportType,
      filtersJson,
      format,
      cronExpression,
      displayName: displayName ?? null,
      deliveryMode,
      recipientUserIds: recipientUserIds ?? [],
      skipDeliveryWhenEmpty,
      consecutiveFailureCount: 0,
      status: 'ACTIVE',
      deletedAt: null,
      lastRunAt: null,
      nextRunAt,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });

    await this.scheduledReportRepo.save(entity);

    // 9. Audit log
    this.auditService.log({
      tenantId: effectiveTenantId,
      actorType: 'USER',
      actorId: userId,
      entityType: 'ScheduledReport',
      entityId: id,
      action: 'scheduledReportCreated',
      after: {
        reportType,
        cronExpression,
        displayName: displayName ?? null,
        deliveryMode,
        recipientUserIds,
        skipDeliveryWhenEmpty,
        format,
      },
    });

    return {
      id,
      reportType,
      cronExpression,
      displayName: displayName ?? null,
      deliveryMode,
      recipientUserIds: recipientUserIds ?? [],
      skipDeliveryWhenEmpty,
      status: 'ACTIVE',
      nextRunAt,
      createdAt: now,
    };
  }
}
