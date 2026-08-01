import type { PrismaClient } from '@prisma/client';
import type { NotificationChannel, NotificationClass, NotificationStatus } from '@properfy/shared';
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
    notificationClass: (row.notification_class ?? null) as NotificationClass | null,
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

/**
 * Rows that never reached the recipient must not satisfy "already sent".
 *
 * `SKIPPED_OPT_OUT` covers both suppression reasons — recipient consent
 * (`CONSENT_OPT_OUT`) and the per-agency occupant switch
 * (`AGENCY_TENANT_NOTIFICATIONS_DISABLED`). Counting them made the dedupe permanent:
 * an agency that blocks tenant notifications and later re-enables them would never get
 * the initial notice or the reminders re-dispatched, and `RetryNotificationUseCase`
 * cannot replay them either (`canBeRetried()` accepts FAILED only).
 *
 * FAILED deliberately still counts: it was attempted, is retryable through the normal
 * path, and re-announcing it would double-send.
 */
const NOT_SUPPRESSED = { status: { not: 'SKIPPED_OPT_OUT' } } as const;

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

  // Cross-tenant: background job self-heals rows whose enqueue was lost
  async findStuckPending(cutoff: Date, limit = 100): Promise<NotificationEntity[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        status: 'PENDING',
        retry_count: 0,
        next_retry_at: null,
        created_at: { lte: cutoff },
      },
      take: limit,
      orderBy: { created_at: 'asc' },
    });
    return rows.map(mapToEntity);
  }

  // Cross-tenant: background reconciliation of SMS delivery receipts
  async findSmsAwaitingDeliveryReceipt(from: Date, to: Date, limit = 100): Promise<NotificationEntity[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        channel: 'SMS',
        status: 'SENT',
        provider_message_id: { not: null },
        sent_at: { gte: from, lte: to },
      },
      take: limit,
      orderBy: { sent_at: 'asc' },
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
        notification_class: notification.notificationClass,
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

  async saveIfAbsent(notification: NotificationEntity): Promise<boolean> {
    const result = await this.prisma.notification.createMany({
      data: {
        id: notification.id,
        tenant_id: notification.tenantId,
        appointment_id: notification.appointmentId,
        recipient: notification.recipient,
        channel: notification.channel,
        template_code: notification.templateCode,
        status: notification.status,
        notification_class: notification.notificationClass,
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
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  async existsByAppointmentAndTemplate(appointmentId: string, templateCode: string): Promise<boolean> {
    const count = await this.prisma.notification.count({
      where: {
        appointment_id: appointmentId,
        template_code: templateCode,
        ...NOT_SUPPRESSED,
      },
    });
    return count > 0;
  }

  async existsByAppointmentAndTemplates(
    appointmentId: string,
    tenantId: string,
    templateCodes: readonly string[],
  ): Promise<boolean> {
    if (templateCodes.length === 0) return false;
    const count = await this.prisma.notification.count({
      where: {
        appointment_id: appointmentId,
        tenant_id: tenantId,
        template_code: { in: [...templateCodes] },
        ...NOT_SUPPRESSED,
      },
    });
    return count > 0;
  }

  async findLatestByAppointmentAndTemplates(
    appointmentId: string,
    tenantId: string,
    templateCodes: readonly string[],
  ): Promise<NotificationEntity | null> {
    if (templateCodes.length === 0) return null;
    const row = await this.prisma.notification.findFirst({
      where: {
        appointment_id: appointmentId,
        tenant_id: tenantId,
        template_code: { in: [...templateCodes] },
        ...NOT_SUPPRESSED,
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    return row ? mapToEntity(row) : null;
  }

  async countByTenantChannelSince(
    tenantId: string | null,
    channel: string,
    since: Date,
  ): Promise<number> {
    return this.prisma.notification.count({
      where: {
        tenant_id: tenantId,
        channel: channel as any,
        created_at: { gte: since },
        // The cap exists to bound spend and provider volume, so it must count only
        // what was actually handed to a provider.
        //
        // `SKIPPED_OPT_OUT` is a DISTINCT enum value from `SKIPPED`, so the original
        // `not: 'SKIPPED'` counted every suppressed row. With the per-agency occupant
        // switch that population exploded — a blocked agency burned its daily quota on
        // messages it never sent, and once exhausted the budget check FAILs everything
        // that follows with no retry, including that agency's own escalation,
        // report-ready and password-reset mail. That is precisely the collateral damage
        // this feature set out to remove, arriving through a different door.
        status: { notIn: ['SKIPPED', 'SKIPPED_OPT_OUT'] },
        // Mirrors are a consequence of suppression, not tenant-driven volume: one is
        // created per withheld message, so counting them would let the mirror traffic
        // exhaust the very cap that then blocks the agency's own mail.
        template_code: { not: 'TENANT_NOTICE_FORWARDED_AGENCY' },
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

  async scrubPayload(
    id: string,
    tenantId: string | null,
    keys: readonly string[],
    replacement: string,
  ): Promise<void> {
    // Atomic jsonb merge: only keys that exist in the payload are overwritten,
    // preserving the payload shape for operators inspecting the notification.
    //
    // The tenant guard is IS NOT DISTINCT FROM, not `=`: platform-scoped
    // notifications carry tenant_id NULL, and `tenant_id = NULL` evaluates to
    // UNKNOWN, so a plain `=` would match zero rows *without throwing* and leave
    // the secret (e.g. a password reset link) in payload_json forever.
    await this.prisma.$executeRaw`
      UPDATE notifications
      SET payload_json = payload_json || (
        SELECT COALESCE(jsonb_object_agg(k, to_jsonb(${replacement}::text)), '{}'::jsonb)
        FROM jsonb_object_keys(payload_json) AS k
        WHERE k = ANY(${[...keys]}::text[])
      )
      WHERE id = ${id} AND tenant_id IS NOT DISTINCT FROM ${tenantId}::text
    `;
  }
}
