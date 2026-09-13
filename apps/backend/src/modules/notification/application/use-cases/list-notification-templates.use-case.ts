import type { AuthContext, NotificationChannel, NotificationClass } from '@properfy/shared';
import type {
  INotificationTemplateRepository,
  NotificationTemplateFilters,
} from '../../domain/notification-template.repository';
import { matchTemplateCodesBySearch } from '../../domain/notification.constants';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';

export interface ListNotificationTemplatesInput {
  tenantId?: string;
  /** Free-text search over code + humanized name + subject (supersedes templateCode). */
  search?: string;
  templateCode?: string;
  channel?: string;
  includeDefaults?: boolean;
  page?: number;
  pageSize?: number;
  actor: AuthContext;
}

export interface NotificationTemplateOutputItem {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  templateCode: string;
  channel: string;
  subject: string | null;
  bodyHtml: string;
  bodyText: string;
  isActive: boolean;
  // Feature 018 classification. Dropping it here left the web list coercing every
  // row to OPERATIONAL, so the "Class" column showed the same value for all rows.
  notificationClass: NotificationClass;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ListNotificationTemplatesOutput {
  data: NotificationTemplateOutputItem[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

export class ListNotificationTemplatesUseCase {
  constructor(
    private readonly templateRepo: INotificationTemplateRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ListNotificationTemplatesInput): Promise<ListNotificationTemplatesOutput> {
    const { actor } = input;

    // 1. Authorization
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'config.notification_templates',
      entityType: 'NotificationTemplate',
    });

    // 2. Build filters
    const filters: NotificationTemplateFilters = {};

    if (actor.role === 'AM' || actor.role === 'OP') {
      if (input.tenantId) {
        filters.tenantId = input.tenantId;
        filters.includeDefaults = input.includeDefaults ?? true;
      }
    } else {
      // CL_ADMIN: force own tenant scope
      filters.tenantId = actor.tenantId;
      filters.includeDefaults = input.includeDefaults ?? true;
    }

    const searchTerm = input.search?.trim();
    if (searchTerm) {
      filters.search = searchTerm;
      // Resolve codes whose code OR humanized label matches, so a search for the
      // friendly name ("Inspection Notice") reaches the code (INSPECTION_NOTICE).
      filters.searchCodes = matchTemplateCodesBySearch(searchTerm);
    } else if (input.templateCode) {
      filters.templateCode = input.templateCode;
    }
    if (input.channel) {
      filters.channel = input.channel as NotificationChannel;
    }

    // 3. Pagination window
    const page = input.page ?? DEFAULT_PAGE;
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    filters.skip = (page - 1) * pageSize;
    filters.take = pageSize;

    // 4. Fetch (repo returns the page plus the true total under the same filters)
    const { items, total } = await this.templateRepo.findAll(filters);

    // 5. Map to output
    return {
      total,
      page,
      pageSize,
      data: items.map(({ template: t, tenantName }) => ({
        id: t.id,
        tenantId: t.tenantId,
        tenantName,
        templateCode: t.templateCode,
        channel: t.channel,
        subject: t.subject,
        bodyHtml: t.bodyHtml ?? '',
        bodyText: t.bodyText,
        isActive: t.active,
        notificationClass: t.notificationClass,
        variables: t.variablesJson,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    };
  }
}
