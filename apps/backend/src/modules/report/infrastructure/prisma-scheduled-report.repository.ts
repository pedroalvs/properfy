import type { PrismaClient } from '@prisma/client';
import type {
  ReportType as PrismaReportType,
  ReportFormat as PrismaReportFormat,
  ScheduleDeliveryMode as PrismaScheduleDeliveryMode,
  ScheduleStatus as PrismaScheduleStatus,
  Prisma,
} from '@prisma/client';
import type { IScheduledReportRepository, ScheduledReportFilters } from '../domain/scheduled-report.repository';
import { ScheduledReportEntity } from '../domain/scheduled-report.entity';

export class PrismaScheduledReportRepository implements IScheduledReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<ScheduledReportEntity | null> {
    const row = await this.prisma.scheduledReport.findFirst({
      where: { id, deleted_at: null },
    });
    return row ? this.toEntity(row) : null;
  }

  async findByIdIncludingDeleted(id: string): Promise<ScheduledReportEntity | null> {
    const row = await this.prisma.scheduledReport.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async findDueForProcessing(now: Date): Promise<ScheduledReportEntity[]> {
    const rows = await this.prisma.scheduledReport.findMany({
      where: {
        status: 'ACTIVE',
        deleted_at: null,
        next_run_at: { lte: now },
      },
      orderBy: { next_run_at: 'asc' },
    });
    return rows.map((r) => this.toEntity(r));
  }

  /** @deprecated — use findDueForProcessing. */
  async findDueSchedules(now: Date): Promise<ScheduledReportEntity[]> {
    return this.findDueForProcessing(now);
  }

  async findAll(
    filters: ScheduledReportFilters,
    page: number,
    pageSize: number,
  ): Promise<ScheduledReportEntity[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.scheduledReport.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return rows.map((r) => this.toEntity(r));
  }

  async count(filters: ScheduledReportFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.scheduledReport.count({ where });
  }

  async countActiveByOwner(userId: string): Promise<number> {
    return this.prisma.scheduledReport.count({
      where: {
        created_by_user_id: userId,
        status: 'ACTIVE',
        deleted_at: null,
      },
    });
  }

  async save(entity: ScheduledReportEntity): Promise<void> {
    await this.prisma.scheduledReport.create({
      data: {
        id: entity.id,
        tenant_id: entity.tenantId,
        report_type: entity.reportType as PrismaReportType,
        filters_json: entity.filtersJson as Prisma.InputJsonValue,
        format: entity.format as PrismaReportFormat,
        cron_expression: entity.cronExpression,
        delivery_email: entity.deliveryEmail,
        display_name: entity.displayName,
        delivery_mode: entity.deliveryMode as PrismaScheduleDeliveryMode,
        recipient_user_ids: entity.recipientUserIds as unknown as Prisma.InputJsonValue,
        skip_delivery_when_empty: entity.skipDeliveryWhenEmpty,
        consecutive_failure_count: entity.consecutiveFailureCount,
        status: entity.status as PrismaScheduleStatus,
        deleted_at: entity.deletedAt,
        is_active: entity.isActive,
        last_run_at: entity.lastRunAt,
        next_run_at: entity.nextRunAt,
        created_by_user_id: entity.createdByUserId,
      },
    });
  }

  async update(entity: ScheduledReportEntity): Promise<void> {
    await this.prisma.scheduledReport.update({
      where: { id: entity.id },
      data: {
        filters_json: entity.filtersJson as Prisma.InputJsonValue,
        cron_expression: entity.cronExpression,
        display_name: entity.displayName,
        delivery_mode: entity.deliveryMode as PrismaScheduleDeliveryMode,
        recipient_user_ids: entity.recipientUserIds as unknown as Prisma.InputJsonValue,
        skip_delivery_when_empty: entity.skipDeliveryWhenEmpty,
        consecutive_failure_count: entity.consecutiveFailureCount,
        status: entity.status as PrismaScheduleStatus,
        deleted_at: entity.deletedAt,
        is_active: entity.isActive,
        last_run_at: entity.lastRunAt,
        next_run_at: entity.nextRunAt,
        created_by_user_id: entity.createdByUserId,
      },
    });
  }

  private buildWhere(filters: ScheduledReportFilters) {
    const where: Record<string, unknown> = {};
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.isActive !== undefined) where.is_active = filters.isActive;
    if (filters.status) where.status = filters.status;
    if (filters.createdByUserId) where.created_by_user_id = filters.createdByUserId;
    if (!filters.includeDeleted) where.deleted_at = null;
    return where;
  }

  private toEntity(row: any): ScheduledReportEntity {
    return new ScheduledReportEntity({
      id: row.id,
      tenantId: row.tenant_id,
      reportType: row.report_type,
      filtersJson: row.filters_json as Record<string, unknown>,
      format: row.format,
      cronExpression: row.cron_expression,
      deliveryEmail: row.delivery_email,
      displayName: row.display_name ?? null,
      deliveryMode: row.delivery_mode,
      recipientUserIds: Array.isArray(row.recipient_user_ids)
        ? (row.recipient_user_ids as string[])
        : [],
      skipDeliveryWhenEmpty: row.skip_delivery_when_empty,
      consecutiveFailureCount: row.consecutive_failure_count,
      status: row.status,
      deletedAt: row.deleted_at ?? null,
      isActive: row.is_active,
      lastRunAt: row.last_run_at,
      nextRunAt: row.next_run_at,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
