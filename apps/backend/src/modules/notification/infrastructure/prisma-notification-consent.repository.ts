import type { PrismaClient } from '@prisma/client';
import type { NotificationChannel } from '@properfy/shared';
import { NotificationConsentEntity } from '../domain/notification-consent.entity';
import type { INotificationConsentRepository } from '../domain/notification-consent.repository';

function mapToEntity(row: any): NotificationConsentEntity {
  return new NotificationConsentEntity({
    id: row.id,
    recipient: row.recipient,
    channel: row.channel as NotificationChannel,
    tenantId: row.tenant_id,
    optedOut: row.opted_out,
    optedOutAt: row.opted_out_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaNotificationConsentRepository implements INotificationConsentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByRecipientChannelTenant(
    recipient: string,
    channel: NotificationChannel,
    tenantId: string,
  ): Promise<NotificationConsentEntity | null> {
    const row = await this.prisma.notificationConsent.findUnique({
      where: {
        recipient_channel_tenant_id: {
          recipient,
          channel,
          tenant_id: tenantId,
        },
      },
    });
    return row ? mapToEntity(row) : null;
  }

  async upsert(consent: NotificationConsentEntity): Promise<void> {
    await this.prisma.notificationConsent.upsert({
      where: {
        recipient_channel_tenant_id: {
          recipient: consent.recipient,
          channel: consent.channel,
          tenant_id: consent.tenantId,
        },
      },
      create: {
        id: consent.id,
        recipient: consent.recipient,
        channel: consent.channel,
        tenant_id: consent.tenantId,
        opted_out: consent.optedOut,
        opted_out_at: consent.optedOutAt,
      },
      update: {
        opted_out: consent.optedOut,
        opted_out_at: consent.optedOutAt,
      },
    });
  }
}
