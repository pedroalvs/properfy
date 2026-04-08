import type { PrismaClient } from '@prisma/client';
import type { NotificationChannel, NotificationStatus } from '@properfy/shared';
import { NotificationEntity } from '../domain/notification.entity';
import type {
  INotificationRepository,
  NotificationFilters,
  NotificationPagination,
} from '../domain/notification.repository';

function mapToEntity(row: any): NotificationEntity {
  return new NotificationEntity({
    id: row.id,
    tenantId: row.tenant_id,
    appointmentId: row.appointment_id,
    recipient: row.recipient,
    channel: row.channel as NotificationChannel,
    templateCode: row.template_code,
    status: row.status as NotificationStatus,
    providerName: row.provider_name,
    providerMessageId: row.provider_message_id,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    failedAt: row.failed_at,
    failureReason: row.failure_reason,
    payloadJson: row.payload_json as Record<string, string>,
    retryCount: row.retry_count,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const SORT_FIELD_MAP: Record<string, string> = {
  createdAt: 'created_at',
  sentAt: 'sent_at',
  status: 'status',
};

function buildWhereClause(filters: NotificationFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filters.tenantId) where.tenant_id = filters.tenantId;
  if (filters.appointmentId) where.appointment_id = filters.appointmentId;
  if (filters.channel) where.channel = filters.channel;
  if (filters.status) where.status = filters.status;
  if (filters.templateCode) where.template_code = filters.templateCode;

  if (filters.fromDate || filters.toDate) {
    const createdAt: Record<string, Date> = {};
    if (filters.fromDate) createdAt.gte = new Date(filters.fromDate);
    if (filters.toDate) createdAt.lte = new Date(filters.toDate);
    where.created_at = createdAt;
  }

  return where;
}

export class PrismaNotificationRepository implements INotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<NotificationEntity | null> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    return row ? mapToEntity(row) : null;
  }

  async findByProviderMessageId(providerMessageId: string): Promise<NotificationEntity | null> {
    const row = await this.prisma.notification.findFirst({
      where: { provider_message_id: providerMessageId },
    });
    return row ? mapToEntity(row) : null;
  }

  async findAll(
    filters: NotificationFilters,
    pagination: NotificationPagination,
  ): Promise<NotificationEntity[]> {
    const where = buildWhereClause(filters);
    const sortField = SORT_FIELD_MAP[pagination.sortBy] ?? 'created_at';

    const rows = await this.prisma.notification.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { [sortField]: pagination.sortOrder },
    });

    return rows.map(mapToEntity);
  }

  async count(filters: NotificationFilters): Promise<number> {
    const where = buildWhereClause(filters);
    return this.prisma.notification.count({ where });
  }

  // Cross-tenant: background job processes all tenants to retry failed notifications
  async findRetryable(now: Date, limit = 100): Promise<NotificationEntity[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        status: 'PENDING',
        retry_count: { gt: 0 },
        next_retry_at: { lte: now },
      },
      take: limit,
      orderBy: { next_retry_at: 'asc' },
    });
    return rows.map(mapToEntity);
  }

  async save(notification: NotificationEntity): Promise<void> {
    await this.prisma.notification.create({
      data: {
        id: notification.id,
        tenant_id: notification.tenantId,
        appointment_id: notification.appointmentId,
        recipient: notification.recipient,
        channel: notification.channel,
        template_code: notification.templateCode,
        status: notification.status,
        provider_name: notification.providerName,
        provider_message_id: notification.providerMessageId,
        sent_at: notification.sentAt,
        delivered_at: notification.deliveredAt,
        failed_at: notification.failedAt,
        failure_reason: notification.failureReason,
        payload_json: notification.payloadJson,
        retry_count: notification.retryCount,
        next_retry_at: notification.nextRetryAt,
      },
    });
  }

  async existsByAppointmentAndTemplate(appointmentId: string, templateCode: string): Promise<boolean> {
    const count = await this.prisma.notification.count({
      where: { appointment_id: appointmentId, template_code: templateCode },
    });
    return count > 0;
  }

  async countByTenantChannelSince(
    tenantId: string,
    channel: string,
    since: Date,
  ): Promise<number> {
    return this.prisma.notification.count({
      where: {
        tenant_id: tenantId,
        channel: channel as any,
        created_at: { gte: since },
        status: { not: 'SKIPPED' },
      },
    });
  }

  async update(notification: NotificationEntity): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: notification.status,
        provider_name: notification.providerName,
        provider_message_id: notification.providerMessageId,
        sent_at: notification.sentAt,
        delivered_at: notification.deliveredAt,
        failed_at: notification.failedAt,
        failure_reason: notification.failureReason,
        retry_count: notification.retryCount,
        next_retry_at: notification.nextRetryAt,
      },
    });
  }
}
