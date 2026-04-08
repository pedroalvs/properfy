import type { PrismaClient } from '@prisma/client';
import type {
  ReportType as PrismaReportType,
  ReportFormat as PrismaReportFormat,
  Prisma,
} from '@prisma/client';
import type { IScheduledReportRepository, ScheduledReportFilters } from '../domain/scheduled-report.repository';
import { ScheduledReportEntity } from '../domain/scheduled-report.entity';

export class PrismaScheduledReportRepository implements IScheduledReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<ScheduledReportEntity | null> {
    const row = await this.prisma.scheduledReport.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async findDueSchedules(now: Date): Promise<ScheduledReportEntity[]> {
    const rows = await this.prisma.scheduledReport.findMany({
      where: {
        is_active: true,
        next_run_at: { lte: now },
      },
      orderBy: { next_run_at: 'asc' },
    });
    return rows.map((r) => this.toEntity(r));
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
        is_active: entity.isActive,
        last_run_at: entity.lastRunAt,
        next_run_at: entity.nextRunAt,
      },
    });
  }

  private buildWhere(filters: ScheduledReportFilters) {
    const where: Record<string, unknown> = {};
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.isActive !== undefined) where.is_active = filters.isActive;
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
      isActive: row.is_active,
      lastRunAt: row.last_run_at,
      nextRunAt: row.next_run_at,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
