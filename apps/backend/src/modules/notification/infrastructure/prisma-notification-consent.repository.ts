import type { PrismaClient } from '@prisma/client';
import type { NotificationChannel, NotificationClass, ConsentChangeSource } from '@properfy/shared';
import { NotificationConsentEntity } from '../domain/notification-consent.entity';
import type {
  INotificationConsentRepository,
  ConsentScope,
  ListConsentsByRecipientParams,
  CountSkippedForRecipientParams,
} from '../domain/notification-consent.repository';

/**
 * Email is case-insensitive by identity, but the send pipeline compares
 * `notification.recipient` verbatim and contacts are stored as entered. F06-2
 * fixes a silent non-block (an opt-out recorded for `Ana@x.com` not matching a
 * send to `ana@x.com`) by canonicalizing EMAIL recipients to lowercase at this
 * one repository choke point — both on write (`upsert`) and on every consent
 * lookup (`findByScope`, `listByRecipient`). Phones (E.164) are left untouched.
 * `.includes('@')` covers `listByRecipient`, whose channel is optional.
 */
function normalizeConsentRecipient(recipient: string, channel?: NotificationChannel): string {
  const isEmail = channel === 'EMAIL' || (channel === undefined && recipient.includes('@'));
  return isEmail ? recipient.trim().toLowerCase() : recipient;
}

function mapToEntity(row: any): NotificationConsentEntity {
  return new NotificationConsentEntity({
    id: row.id,
    recipient: row.recipient,
    channel: row.channel as NotificationChannel,
    tenantId: row.tenant_id,
    notificationClass: row.notification_class as NotificationClass,
    optedOut: row.opted_out,
    optedOutAt: row.opted_out_at,
    changeSource: (row.change_source ?? null) as ConsentChangeSource | null,
    changedAt: row.changed_at ?? null,
    changedByUserId: row.changed_by_user_id ?? null,
    reason: row.reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaNotificationConsentRepository implements INotificationConsentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Legacy lookup — returns the OPERATIONAL consent row for the tuple.
   * Preserved for the send-worker's existing call site; the send worker will migrate
   * to `findByScope` in feature 018 Wave 2.
   *
   * @deprecated Use `findByScope`.
   */
  async findByRecipientChannelTenant(
    recipient: string,
    channel: NotificationChannel,
    tenantId: string,
  ): Promise<NotificationConsentEntity | null> {
    return this.findByScope({
      tenantId,
      recipient,
      channel,
      notificationClass: 'OPERATIONAL',
    });
  }

  async findByScope(scope: ConsentScope): Promise<NotificationConsentEntity | null> {
    // A platform-scoped notification has no agency, and notification_consents
    // is keyed on a NOT NULL tenant_id — so no consent record can exist for it.
    // Answer that directly instead of asking Prisma for an impossible row.
    if (scope.tenantId === null) return null;
    const row = await this.prisma.notificationConsent.findFirst({
      where: {
        recipient: normalizeConsentRecipient(scope.recipient, scope.channel),
        channel: scope.channel,
        tenant_id: scope.tenantId,
        notification_class: scope.notificationClass,
      },
    });
    return row ? mapToEntity(row) : null;
  }

  async listByRecipient(params: ListConsentsByRecipientParams): Promise<NotificationConsentEntity[]> {
    const rows = await this.prisma.notificationConsent.findMany({
      where: {
        tenant_id: params.tenantId,
        recipient: normalizeConsentRecipient(params.recipient, params.channel),
        ...(params.channel ? { channel: params.channel } : {}),
      },
      orderBy: [{ channel: 'asc' }, { notification_class: 'asc' }],
    });
    return rows.map(mapToEntity);
  }

  async countSkippedForRecipient(params: CountSkippedForRecipientParams): Promise<number> {
    return this.prisma.notification.count({
      where: {
        tenant_id: params.tenantId,
        recipient: params.recipient,
        status: 'SKIPPED_OPT_OUT',
      },
    });
  }

  async findById(id: string): Promise<NotificationConsentEntity | null> {
    const row = await this.prisma.notificationConsent.findUnique({ where: { id } });
    return row ? mapToEntity(row) : null;
  }

  async upsert(consent: NotificationConsentEntity): Promise<void> {
    // Use findFirst + create/update pattern because the composite unique key
    // (recipient, channel, tenant_id, notification_class) may have a verbose name
    // and we want to stay resilient to Prisma client naming changes.
    const existing = await this.prisma.notificationConsent.findFirst({
      where: {
        recipient: normalizeConsentRecipient(consent.recipient, consent.channel),
        channel: consent.channel,
        tenant_id: consent.tenantId,
        notification_class: consent.notificationClass,
      },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.notificationConsent.update({
        where: { id: existing.id },
        data: {
          opted_out: consent.optedOut,
          opted_out_at: consent.optedOutAt,
          change_source: consent.changeSource,
          changed_at: consent.changedAt,
          changed_by_user_id: consent.changedByUserId,
          reason: consent.reason,
        },
      });
    } else {
      await this.prisma.notificationConsent.create({
        data: {
          id: consent.id,
          recipient: normalizeConsentRecipient(consent.recipient, consent.channel),
          channel: consent.channel,
          tenant_id: consent.tenantId,
          notification_class: consent.notificationClass,
          opted_out: consent.optedOut,
          opted_out_at: consent.optedOutAt,
          change_source: consent.changeSource,
          changed_at: consent.changedAt,
          changed_by_user_id: consent.changedByUserId,
          reason: consent.reason,
        },
      });
    }
  }
}
