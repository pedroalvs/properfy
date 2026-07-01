import type { PrismaClient } from '@prisma/client';
import type {
  ReportStatus as PrismaReportStatus,
  ReportType as PrismaReportType,
  Prisma,
} from '@prisma/client';
import type { IReportRepository, ReportFilters } from '../domain/report.repository';
import type { ReportStatus } from '@properfy/shared';
import { ReportEntity } from '../domain/report.entity';

export class PrismaReportRepository implements IReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<ReportEntity | null> {
    const row = await this.prisma.report.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async findAll(filters: ReportFilters, page: number, pageSize: number): Promise<ReportEntity[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.report.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return rows.map((r) => this.toEntity(r));
  }

  async count(filters: ReportFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.report.count({ where });
  }

  async countByUserAndStatuses(userId: string, statuses: ReportStatus[]): Promise<number> {
    return this.prisma.report.count({
      where: {
        requested_by_user_id: userId,
        status: { in: statuses as PrismaReportStatus[] },
      },
    });
  }

  async findExpiredWithFileKey(): Promise<ReportEntity[]> {
    const rows = await this.prisma.report.findMany({
      where: {
        status: 'READY' as PrismaReportStatus,
        expires_at: { lt: new Date() },
        file_key: { not: null },
      },
    });
    return rows.map((r) => this.toEntity(r));
  }

  async save(entity: ReportEntity): Promise<void> {
    await this.prisma.report.create({
      data: {
        id: entity.id,
        tenant_id: entity.tenantId,
        report_type: entity.reportType as PrismaReportType,
        filters_json: entity.filtersJson as Prisma.InputJsonValue,
        status: entity.status as PrismaReportStatus,
        file_key: entity.fileKey,
        requested_by_user_id: entity.requestedByUserId,
        started_at: entity.startedAt,
        completed_at: entity.completedAt,
        failed_at: entity.failedAt,
        error_message: entity.errorMessage,
        row_count: entity.rowCount,
        expires_at: entity.expiresAt,
      },
    });
  }

  async update(entity: ReportEntity): Promise<void> {
    await this.prisma.report.update({
      where: { id: entity.id },
      data: {
        tenant_id: entity.tenantId,
        report_type: entity.reportType as PrismaReportType,
        filters_json: entity.filtersJson as Prisma.InputJsonValue,
        status: entity.status as PrismaReportStatus,
        file_key: entity.fileKey,
        started_at: entity.startedAt,
        completed_at: entity.completedAt,
        failed_at: entity.failedAt,
        error_message: entity.errorMessage,
        row_count: entity.rowCount,
        expires_at: entity.expiresAt,
      },
    });
  }

  private buildWhere(filters: ReportFilters) {
    const where: Record<string, unknown> = {};
    if (filters.tenantId !== undefined) where.tenant_id = filters.tenantId;
    if (filters.requestedByUserId) where.requested_by_user_id = filters.requestedByUserId;
    if (filters.reportType) where.report_type = filters.reportType;
    if (filters.status) where.status = filters.status;
    if (filters.fromDate || filters.toDate) {
      const createdAt: Record<string, Date> = {};
      if (filters.fromDate) createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) {
        const to = new Date(filters.toDate);
        to.setDate(to.getDate() + 1);
        createdAt.lt = to;
      }
      where.created_at = createdAt;
    }
    return where;
  }

  private toEntity(row: any): ReportEntity {
    return new ReportEntity({
      id: row.id,
      tenantId: row.tenant_id,
      reportType: row.report_type,
      filtersJson: row.filters_json as Record<string, unknown>,
      status: row.status,
      fileKey: row.file_key,
      requestedByUserId: row.requested_by_user_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      failedAt: row.failed_at,
      errorMessage: row.error_message,
      rowCount: row.row_count,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
