import type { NotificationTemplateEntity } from './notification-template.entity';
import type { NotificationChannel } from '@properfy/shared';

export interface NotificationTemplateFilters {
  tenantId?: string | null;
  templateCode?: string;
  channel?: NotificationChannel;
  includeDefaults?: boolean;
}

export interface INotificationTemplateRepository {
  findByTenantCodeChannel(
    tenantId: string | null,
    templateCode: string,
    channel: NotificationChannel,
  ): Promise<NotificationTemplateEntity | null>;
  findAll(filters: NotificationTemplateFilters): Promise<NotificationTemplateEntity[]>;
  upsert(template: NotificationTemplateEntity): Promise<void>;
}
