import type { PrismaClient } from '@prisma/client';
import type { Prisma, ScheduleRunStatus as PrismaScheduleRunStatus } from '@prisma/client';
import type { IScheduledReportRunRepository } from '../domain/scheduled-report-run.repository';
import {
  ScheduledReportRunEntity,
  type DeliveryOutcome,
} from '../domain/scheduled-report-run.entity';

export class PrismaScheduledReportRunRepository implements IScheduledReportRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(entity: ScheduledReportRunEntity): Promise<void> {
    await this.prisma.scheduledReportRun.create({
      data: {
        id: entity.id,
        schedule_id: entity.scheduleId,
        report_id: entity.reportId,
        status: entity.status as PrismaScheduleRunStatus,
        scheduled_for: entity.scheduledFor,
        started_at: entity.startedAt,
        completed_at: entity.completedAt,
        error_message: entity.errorMessage,
        recipient_count: entity.recipientCount,
        delivery_status_json: (entity.deliveryStatusJson ?? null) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async update(entity: ScheduledReportRunEntity): Promise<void> {
    await this.prisma.scheduledReportRun.update({
      where: { id: entity.id },
      data: {
        report_id: entity.reportId,
        status: entity.status as PrismaScheduleRunStatus,
        started_at: entity.startedAt,
        completed_at: entity.completedAt,
        error_message: entity.errorMessage,
        recipient_count: entity.recipientCount,
        delivery_status_json: (entity.deliveryStatusJson ?? null) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findById(id: string): Promise<ScheduledReportRunEntity | null> {
    const row = await this.prisma.scheduledReportRun.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async findByReportId(reportId: string): Promise<ScheduledReportRunEntity | null> {
    const row = await this.prisma.scheduledReportRun.findFirst({
      where: { report_id: reportId },
      orderBy: { created_at: 'desc' },
    });
    return row ? this.toEntity(row) : null;
  }

  async findByScheduleAndScheduledFor(
    scheduleId: string,
    scheduledFor: Date,
  ): Promise<ScheduledReportRunEntity | null> {
    const row = await this.prisma.scheduledReportRun.findFirst({
      where: { schedule_id: scheduleId, scheduled_for: scheduledFor },
    });
    return row ? this.toEntity(row) : null;
  }

  async findByScheduleId(
    scheduleId: string,
    page: number,
    pageSize: number,
  ): Promise<ScheduledReportRunEntity[]> {
    const rows = await this.prisma.scheduledReportRun.findMany({
      where: { schedule_id: scheduleId },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return rows.map((r) => this.toEntity(r));
  }

  async countByScheduleId(scheduleId: string): Promise<number> {
    return this.prisma.scheduledReportRun.count({
      where: { schedule_id: scheduleId },
    });
  }

  async findLatestForSchedule(scheduleId: string): Promise<ScheduledReportRunEntity | null> {
    const row = await this.prisma.scheduledReportRun.findFirst({
      where: { schedule_id: scheduleId },
      orderBy: { created_at: 'desc' },
    });
    return row ? this.toEntity(row) : null;
  }

  async findLatestForSchedules(
    scheduleIds: string[],
  ): Promise<Map<string, ScheduledReportRunEntity>> {
    if (scheduleIds.length === 0) return new Map();
    // Use a window function style via raw SQL would be faster, but keep it simple:
    // fetch the 1st row per schedule via N findFirst calls for the small result set
    // expected on a single page. The Prisma approach `distinct` doesn't guarantee ORDER BY.
    const result = new Map<string, ScheduledReportRunEntity>();
    for (const scheduleId of scheduleIds) {
      const row = await this.findLatestForSchedule(scheduleId);
      if (row) result.set(scheduleId, row);
    }
    return result;
  }

  private toEntity(row: any): ScheduledReportRunEntity {
    return new ScheduledReportRunEntity({
      id: row.id,
      scheduleId: row.schedule_id,
      reportId: row.report_id ?? null,
      status: row.status,
      scheduledFor: row.scheduled_for,
      startedAt: row.started_at ?? null,
      completedAt: row.completed_at ?? null,
      errorMessage: row.error_message ?? null,
      recipientCount: row.recipient_count ?? null,
      deliveryStatusJson: (row.delivery_status_json as DeliveryOutcome[] | null) ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
