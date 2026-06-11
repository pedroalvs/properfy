import type { AuthContext, NotificationChannel } from '@properfy/shared';
import type {
  INotificationTemplateRepository,
  NotificationTemplateFilters,
} from '../../domain/notification-template.repository';
import type { ITemplateImageBindingRepository } from '../../domain/template-image-binding.repository';
import type { IEmailAssetRepository } from '../../domain/email-asset.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';

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
  tenantName: string | null;
  templateCode: string;
  channel: string;
  subject: string | null;
  bodyHtml: string;
  bodyText: string;
  imageBindings: Array<{ id: string; placeholderKey: string; assetId: string; publicUrl: string; altText: string | null; width: number | null; height: number | null }>;
  isActive: boolean;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ListNotificationTemplatesOutput {
  data: NotificationTemplateOutputItem[];
}

export class ListNotificationTemplatesUseCase {
  constructor(
    private readonly templateRepo: INotificationTemplateRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly bindingRepo?: ITemplateImageBindingRepository,
    private readonly assetRepo?: IEmailAssetRepository,
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

    if (input.templateCode) {
      filters.templateCode = input.templateCode;
    }
    if (input.channel) {
      filters.channel = input.channel as NotificationChannel;
    }

    // 3. Fetch
    const templates = await this.templateRepo.findAll(filters);

    // 4. Resolve image bindings for each template (only when repos are injected)
    type BindingItem = NotificationTemplateOutputItem['imageBindings'][number];
    const bindingsByTemplate = new Map<string, BindingItem[]>();

    if (this.bindingRepo && this.assetRepo && templates.length > 0) {
      await Promise.all(
        templates.map(async ({ template: t }) => {
          const bindings = await this.bindingRepo!.findByTemplate(t.id);
          const resolved = await Promise.all(
            bindings.map(async (b) => {
              const asset = await this.assetRepo!.findById(b.assetId);
              if (!asset) return null;
              return {
                id: b.id,
                placeholderKey: b.placeholderKey,
                assetId: b.assetId,
                publicUrl: asset.publicUrl,
                altText: b.altText,
                width: b.width,
                height: b.height,
              } satisfies BindingItem;
            }),
          );
          bindingsByTemplate.set(t.id, resolved.filter(Boolean) as BindingItem[]);
        }),
      );
    }

    // 5. Map to output
    return {
      data: templates.map(({ template: t, tenantName }) => ({
        id: t.id,
        tenantId: t.tenantId,
        tenantName,
        templateCode: t.templateCode,
        channel: t.channel,
        subject: t.subject,
        bodyHtml: t.bodyHtml ?? '',
        bodyText: t.bodyText,
        imageBindings: bindingsByTemplate.get(t.id) ?? [],
        isActive: t.active,
        variables: t.variablesJson,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    };
  }
}
