import type { NotificationConsentEntity } from './notification-consent.entity';
import type { NotificationChannel } from '@properfy/shared';

export interface INotificationConsentRepository {
  findByRecipientChannelTenant(
    recipient: string,
    channel: NotificationChannel,
    tenantId: string,
  ): Promise<NotificationConsentEntity | null>;
  upsert(consent: NotificationConsentEntity): Promise<void>;
}
