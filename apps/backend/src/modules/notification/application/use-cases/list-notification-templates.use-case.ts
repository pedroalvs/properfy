import type { AuthContext, NotificationChannel } from '@properfy/shared';
import type {
  INotificationTemplateRepository,
  NotificationTemplateFilters,
} from '../../domain/notification-template.repository';
import { NotificationForbiddenError } from '../../domain/notification.errors';

export interface ListNotificationTemplatesInput {
  tenantId?: string;
  templateCode?: string;
  channel?: string;
  includeDefaults?: boolean;
  actor: AuthContext;
}

export interface NotificationTemplateOutputItem {
  id: string;
  tenantId: string | null;
  templateCode: string;
  channel: string;
  subject: string | null;
  bodyText: string;
  isActive: boolean;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ListNotificationTemplatesOutput {
  data: NotificationTemplateOutputItem[];
}

export class ListNotificationTemplatesUseCase {
  constructor(private readonly templateRepo: INotificationTemplateRepository) {}

  async execute(input: ListNotificationTemplatesInput): Promise<ListNotificationTemplatesOutput> {
    const { actor } = input;

    // 1. Authorization
    if (actor.role !== 'AM' && actor.role !== 'CL_ADMIN') {
      throw new NotificationForbiddenError();
    }

    // 2. Build filters
    const filters: NotificationTemplateFilters = {};

    if (actor.role === 'AM') {
      if (input.tenantId) {
        filters.tenantId = input.tenantId;
        filters.includeDefaults = input.includeDefaults ?? true;
      }
    } else {
      // CL_ADMIN: force own tenant scope
      filters.tenantId = actor.tenantId;
      filters.includeDefaults = input.includeDefaults ?? true;
    }

    if (input.templateCode) {
      filters.templateCode = input.templateCode;
    }
    if (input.channel) {
      filters.channel = input.channel as NotificationChannel;
    }

    // 3. Fetch
    const templates = await this.templateRepo.findAll(filters);

    // 4. Map to output
    return {
      data: templates.map((t) => ({
        id: t.id,
        tenantId: t.tenantId,
        templateCode: t.templateCode,
        channel: t.channel,
        subject: t.subject,
        bodyText: t.bodyText,
        isActive: t.active,
        variables: t.variablesJson,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    };
  }
}
