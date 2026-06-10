import type { NotificationTemplateEntity } from './notification-template.entity';
import type { NotificationChannel } from '@properfy/shared';

export interface NotificationTemplateFilters {
  tenantId?: string | null;
  templateCode?: string;
  channel?: NotificationChannel;
  includeDefaults?: boolean;
}

/**
 * Read-model returned by list queries: the template entity plus the owning
 * agency's display name (null for platform-default templates, tenant_id = NULL).
 */
export interface NotificationTemplateListItem {
  template: NotificationTemplateEntity;
  tenantName: string | null;
}

export interface INotificationTemplateRepository {
  findByTenantCodeChannel(
    tenantId: string | null,
    templateCode: string,
    channel: NotificationChannel,
  ): Promise<NotificationTemplateEntity | null>;
  findAll(filters: NotificationTemplateFilters): Promise<NotificationTemplateListItem[]>;
  upsert(template: NotificationTemplateEntity): Promise<void>;
}
