import type { IScheduledReportRepository } from '../../domain/scheduled-report.repository';
import type { IScheduledReportRunRepository } from '../../domain/scheduled-report-run.repository';
import type { ScheduledReportEntity } from '../../domain/scheduled-report.entity';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthContext, ScheduleStatus, ScheduleRunStatus, ScheduleDeliveryMode } from '@properfy/shared';

export interface ListScheduledReportsInput {
  page: number;
  pageSize: number;
  status?: ScheduleStatus;
}

export interface ScheduledReportDto {
  id: string;
  tenantId: string;
  reportType: string;
  filtersJson: Record<string, unknown>;
  format: string;
  cronExpression: string;
  deliveryEmail: string;
  // Feature 019 additions
  displayName: string | null;
  deliveryMode: ScheduleDeliveryMode;
  recipientUserIds: string[];
  skipDeliveryWhenEmpty: boolean;
  consecutiveFailureCount: number;
  status: ScheduleStatus;
  deletedAt: Date | null;
  lastRunStatus: ScheduleRunStatus | null;
  isActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(
  entity: ScheduledReportEntity,
  lastRunStatus: ScheduleRunStatus | null,
): ScheduledReportDto {
  return {
    id: entity.id,
    tenantId: entity.tenantId,
    reportType: entity.reportType,
    filtersJson: entity.filtersJson,
    format: entity.format,
    cronExpression: entity.cronExpression,
    deliveryEmail: entity.deliveryEmail,
    displayName: entity.displayName,
    deliveryMode: entity.deliveryMode,
    recipientUserIds: entity.recipientUserIds,
    skipDeliveryWhenEmpty: entity.skipDeliveryWhenEmpty,
    consecutiveFailureCount: entity.consecutiveFailureCount,
    status: entity.status,
    deletedAt: entity.deletedAt,
    lastRunStatus,
    isActive: entity.isActive,
    lastRunAt: entity.lastRunAt,
    nextRunAt: entity.nextRunAt,
    createdByUserId: entity.createdByUserId,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

/**
 * Feature 019: list scheduled reports with per-role scoping.
 *
 * - AM: all tenants
 * - OP: own tenant
 * - CL_ADMIN: own tenant
 * - CL_USER: own records within own tenant
 * - INSP / TNT: forbidden
 */
export class ListScheduledReportsUseCase {
  constructor(
    private readonly scheduledReportRepo: IScheduledReportRepository,
    private readonly runRepo?: IScheduledReportRunRepository,
  ) {}

  async execute(
    input: ListScheduledReportsInput,
    auth: AuthContext,
  ): Promise<{ data: ScheduledReportDto[]; meta: { total: number } }> {
    const { page, pageSize, status } = input;
    const { tenantId, role, userId } = auth;

    if (role !== 'AM' && role !== 'OP' && role !== 'CL_ADMIN' && role !== 'CL_USER') {
      throw new ForbiddenError('FORBIDDEN', 'Role not permitted to view scheduled reports');
    }

    const filters: Record<string, unknown> = {};
    if (role === 'AM') {
      // cross-tenant
    } else {
      if (!tenantId) {
        throw new ForbiddenError('FORBIDDEN', 'Missing tenant context');
      }
      filters.tenantId = tenantId;
    }
    if (role === 'CL_USER') {
      filters.createdByUserId = userId;
    }
    if (status) {
      filters.status = status;
    }

    const [data, total] = await Promise.all([
      this.scheduledReportRepo.findAll(filters, page, pageSize),
      this.scheduledReportRepo.count(filters),
    ]);

    // Enrich with last-run-status
    let latestRunsByScheduleId = new Map<string, { status: ScheduleRunStatus }>();
    if (this.runRepo && data.length > 0) {
      const ids = data.map((s) => s.id);
      const runs = await this.runRepo.findLatestForSchedules(ids);
      latestRunsByScheduleId = runs;
    }

    return {
      data: data.map((s) => toDto(s, latestRunsByScheduleId.get(s.id)?.status ?? null)),
      meta: { total },
    };
  }
}
