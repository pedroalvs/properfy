import { randomUUID } from 'node:crypto';
import type { IScheduledReportRepository } from '../../domain/scheduled-report.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { ScheduledReportEntity } from '../../domain/scheduled-report.entity';
import { ForbiddenError } from '../../../../shared/domain/errors';
import {
  InvalidCronExpressionError,
  InvalidReportTypeError,
  ReportTenantScopeViolationError,
} from '../../domain/report.errors';
import { parseCronExpression, getNextRunTime } from '../../domain/cron-parser';
import { REPORT_COLUMNS } from '../../domain/report.constants';
import type { ReportType, ReportFormat, AuthContext } from '@properfy/shared';

export interface CreateScheduledReportInput {
  reportType: ReportType;
  filtersJson: Record<string, unknown>;
  format: ReportFormat;
  cronExpression: string;
  deliveryEmail: string;
}

export interface CreateScheduledReportOutput {
  id: string;
  reportType: ReportType;
  cronExpression: string;
  deliveryEmail: string;
  isActive: boolean;
  nextRunAt: Date | null;
  createdAt: Date;
}

export class CreateScheduledReportUseCase {
  constructor(
    private readonly scheduledReportRepo: IScheduledReportRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: CreateScheduledReportInput, auth: AuthContext): Promise<CreateScheduledReportOutput> {
    const { reportType, filtersJson, format, cronExpression, deliveryEmail } = input;
    const { userId, tenantId, role } = auth;

    // 1. Only AM and OP can create scheduled reports
    if (role !== 'AM' && role !== 'OP') {
      throw new ForbiddenError('FORBIDDEN', 'Only AM and OP can create scheduled reports');
    }

    // 2. Validate report type
    if (!REPORT_COLUMNS[reportType]) {
      throw new InvalidReportTypeError(reportType);
    }

    // 3. Validate cron expression
    try {
      parseCronExpression(cronExpression);
    } catch (err) {
      throw new InvalidCronExpressionError((err as Error).message);
    }

    // 4. Determine effective tenant
    let effectiveTenantId: string;
    if (role === 'AM') {
      // AM can specify a tenant or use the filter tenant
      effectiveTenantId = (filtersJson.tenantId as string) ?? tenantId ?? '';
      if (!effectiveTenantId) {
        throw new ForbiddenError('FORBIDDEN', 'Scheduled reports require a tenant context');
      }
    } else {
      // OP — use JWT tenant if available, or filter tenant
      if (filtersJson.tenantId && tenantId && filtersJson.tenantId !== tenantId) {
        throw new ReportTenantScopeViolationError();
      }
      effectiveTenantId = tenantId ?? (filtersJson.tenantId as string) ?? '';
      if (!effectiveTenantId) {
        throw new ForbiddenError('FORBIDDEN', 'Scheduled reports require a tenant context');
      }
    }

    // 5. Compute next run time
    const now = new Date();
    const nextRunAt = getNextRunTime(cronExpression, now);

    // 6. Create entity
    const id = randomUUID();
    const entity = new ScheduledReportEntity({
      id,
      tenantId: effectiveTenantId,
      reportType,
      filtersJson,
      format,
      cronExpression,
      deliveryEmail,
      isActive: true,
      lastRunAt: null,
      nextRunAt,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });

    await this.scheduledReportRepo.save(entity);

    // 7. Audit log
    this.auditService.log({
      tenantId: effectiveTenantId,
      actorType: 'USER',
      actorId: userId,
      entityType: 'ScheduledReport',
      entityId: id,
      action: 'scheduledReportCreated',
      metadata: { reportType, cronExpression, deliveryEmail, format },
    });

    return {
      id,
      reportType,
      cronExpression,
      deliveryEmail,
      isActive: true,
      nextRunAt,
      createdAt: now,
    };
  }
}
