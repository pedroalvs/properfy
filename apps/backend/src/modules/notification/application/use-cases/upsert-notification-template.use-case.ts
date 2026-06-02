import type { AuthContext, NotificationChannel, NotificationClass } from '@properfy/shared';
import { ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { INotificationTemplateRepository } from '../../domain/notification-template.repository';
import type { TemplateRendererService } from '../../domain/template-renderer.service';
import { NotificationForbiddenError, ProtectedTemplateClassificationError } from '../../domain/notification.errors';
import {
  MANDATORY_TEMPLATE_CODES,
  getProtectedClass,
  getDefaultClass,
} from '../../domain/notification.constants';
import { NotificationTemplateEntity } from '../../domain/notification-template.entity';

const VALID_CHANNELS: NotificationChannel[] = ['EMAIL', 'SMS'];

export interface UpsertNotificationTemplateInput {
  templateCode: string;
  channel: string;
  subject?: string;
  bodyHtml?: string;
  /** @deprecated Will be removed in T015; use bodyHtml + auto-derive. */
  bodyText?: string;
  isActive: boolean;
  notificationClass?: NotificationClass;
  actor: AuthContext;
  tenantId?: string;
  imageBindings?: Array<{ placeholderKey: string; altText?: string; width?: number; height?: number }>;
}

export interface UpsertNotificationTemplateOutput {
  id: string;
  tenantId: string | null;
  templateCode: string;
  channel: string;
  subject: string | null;
  bodyText: string;
  isActive: boolean;
  notificationClass: NotificationClass;
  createdAt: string;
  updatedAt: string;
}

export class UpsertNotificationTemplateUseCase {
  constructor(
    private readonly templateRepo: INotificationTemplateRepository,
    private readonly templateRenderer: TemplateRendererService,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: UpsertNotificationTemplateInput): Promise<UpsertNotificationTemplateOutput> {
    const { actor } = input;

    // 1. Authorization — initial role gate
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'config.notification_templates',
      entityType: 'NotificationTemplate',
    });

    // Tenant-scoping logic per role
    let tenantId: string | null;
    if (actor.role === 'AM') {
      tenantId = null;
    } else if (actor.role === 'OP') {
      // OP may edit tenant-specific overrides but never platform defaults.
      // OP is cross-tenant (tenantId is null in JWT), so platform-default writes are forbidden.
      if (!actor.tenantId) {
        throw new NotificationForbiddenError();
      }
      tenantId = actor.tenantId;
    } else {
      // CL_ADMIN
      tenantId = actor.tenantId;
    }

    // 2. Validate templateCode
    if (!MANDATORY_TEMPLATE_CODES.includes(input.templateCode as typeof MANDATORY_TEMPLATE_CODES[number])) {
      throw new ValidationError('Invalid template code');
    }

    // 3. Validate channel
    if (!VALID_CHANNELS.includes(input.channel as NotificationChannel)) {
      throw new ValidationError('Invalid notification channel');
    }

    // 4. Feature 018: resolve and validate notification classification (FR-004, FR-005)
    const protectedClass = getProtectedClass(input.templateCode);
    let resolvedClass: NotificationClass;
    if (protectedClass) {
      // Protected template codes are immutable — reject reclassification attempts
      if (input.notificationClass && input.notificationClass !== protectedClass) {
        throw new ProtectedTemplateClassificationError(input.templateCode, protectedClass);
      }
      resolvedClass = protectedClass;
    } else {
      // Non-protected: use provided class or fall back to the default map (OPERATIONAL for most)
      resolvedClass = input.notificationClass ?? getDefaultClass(input.templateCode);
    }

    // 5. Extract variables
    const allVariables = new Set<string>();
    for (const variable of this.templateRenderer.extractVariables(input.bodyText ?? '')) {
      allVariables.add(variable);
    }
    if (input.bodyHtml) {
      for (const variable of this.templateRenderer.extractVariables(input.bodyHtml)) {
        allVariables.add(variable);
      }
    }
    if (input.subject) {
      for (const variable of this.templateRenderer.extractVariables(input.subject)) {
        allVariables.add(variable);
      }
    }
    const variablesJson = [...allVariables];

    // 6. Create entity
    const now = new Date();
    const template = new NotificationTemplateEntity({
      id: crypto.randomUUID(),
      tenantId,
      templateCode: input.templateCode,
      channel: input.channel as NotificationChannel,
      subject: input.subject ?? null,
      bodyHtml: input.bodyHtml ?? null,
      bodyText: input.bodyText ?? '',
      variablesJson,
      isActive: input.isActive,
      notificationClass: resolvedClass,
      createdAt: now,
      updatedAt: now,
    });

    // 6. Upsert
    await this.templateRepo.upsert(template);

    // 7. Audit
    this.auditService.log({
      action: 'NOTIFICATION_TEMPLATE_UPSERTED',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'NOTIFICATION_TEMPLATE',
      entityId: template.id,
      tenantId: tenantId ?? undefined,
      after: {
        templateCode: template.templateCode,
        channel: template.channel,
        isActive: template.active,
      },
    });

    // 8. Return output
    return {
      id: template.id,
      tenantId: template.tenantId,
      templateCode: template.templateCode,
      channel: template.channel,
      subject: template.subject,
      bodyText: template.bodyText,
      isActive: template.active,
      notificationClass: template.notificationClass,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }
}
