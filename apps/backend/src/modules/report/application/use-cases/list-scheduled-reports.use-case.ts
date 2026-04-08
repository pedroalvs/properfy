import type { IScheduledReportRepository } from '../../domain/scheduled-report.repository';
import type { ScheduledReportEntity } from '../../domain/scheduled-report.entity';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthContext } from '@properfy/shared';

export interface ListScheduledReportsInput {
  page: number;
  pageSize: number;
}

export interface ScheduledReportDto {
  id: string;
  tenantId: string;
  reportType: string;
  filtersJson: Record<string, unknown>;
  format: string;
  cronExpression: string;
  deliveryEmail: string;
  isActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(entity: ScheduledReportEntity): ScheduledReportDto {
  return {
    id: entity.id,
    tenantId: entity.tenantId,
    reportType: entity.reportType,
    filtersJson: entity.filtersJson,
    format: entity.format,
    cronExpression: entity.cronExpression,
    deliveryEmail: entity.deliveryEmail,
    isActive: entity.isActive,
    lastRunAt: entity.lastRunAt,
    nextRunAt: entity.nextRunAt,
    createdByUserId: entity.createdByUserId,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export class ListScheduledReportsUseCase {
  constructor(
    private readonly scheduledReportRepo: IScheduledReportRepository,
  ) {}

  async execute(
    input: ListScheduledReportsInput,
    auth: AuthContext,
  ): Promise<{ data: ScheduledReportDto[]; meta: { total: number } }> {
    const { page, pageSize } = input;
    const { tenantId, role } = auth;

    // Only AM and OP can view scheduled reports
    if (role !== 'AM' && role !== 'OP') {
      throw new ForbiddenError('FORBIDDEN', 'Only AM and OP can view scheduled reports');
    }

    // Tenant-scoped: AM sees all, OP sees their tenant
    const filters = tenantId ? { tenantId } : {};

    const [data, total] = await Promise.all([
      this.scheduledReportRepo.findAll(filters, page, pageSize),
      this.scheduledReportRepo.count(filters),
    ]);

    return {
      data: data.map(toDto),
      meta: { total },
    };
  }
}
