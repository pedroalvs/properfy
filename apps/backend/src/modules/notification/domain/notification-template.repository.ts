import type { NotificationTemplateEntity } from './notification-template.entity';
import type { NotificationChannel } from '@properfy/shared';

export interface NotificationTemplateFilters {
  tenantId?: string | null;
  templateCode?: string;
  /**
   * Free-text search term matched (case-insensitive) against the raw `template_code`
   * and the `subject`. Combined with {@link searchCodes} so a search on the humanized
   * name still reaches rows whose subject does not contain the term.
   */
  search?: string;
  /**
   * Template codes whose code or humanized label matched the search term, resolved by
   * the use case via the shared registry. Rows with any of these codes match even when
   * neither their raw code nor subject contains the term.
   */
  searchCodes?: string[];
  channel?: NotificationChannel;
  includeDefaults?: boolean;
  /**
   * Pagination window. When omitted, all matching rows are returned (callers that
   * do not paginate keep their previous behaviour). `total` in the result always
   * reflects the full filtered set, independent of this window.
   */
  skip?: number;
  take?: number;
}

/**
 * Read-model returned by list queries: the template entity plus the owning
 * agency's display name (null for platform-default templates, tenant_id = NULL).
 */
export interface NotificationTemplateListItem {
  template: NotificationTemplateEntity;
  tenantName: string | null;
}

/**
 * Paginated read-model: the page of list items plus the true count of all rows
 * matching the filters (ignoring skip/take).
 */
export interface NotificationTemplateListResult {
  items: NotificationTemplateListItem[];
  total: number;
}

export interface INotificationTemplateRepository {
  findByTenantCodeChannel(
    tenantId: string | null,
    templateCode: string,
    channel: NotificationChannel,
  ): Promise<NotificationTemplateEntity | null>;
  findAll(filters: NotificationTemplateFilters): Promise<NotificationTemplateListResult>;
  findById(templateId: string): Promise<NotificationTemplateEntity | null>;
  upsert(template: NotificationTemplateEntity): Promise<void>;
  /**
   * Hard-deletes a tenant override. Platform-default templates (tenant_id = NULL)
   * are never deleted — the implementation guards with `tenant_id NOT NULL`.
   */
  delete(templateId: string): Promise<void>;
}
