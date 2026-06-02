import type { AuthContext, NotificationChannel, NotificationClass } from '@properfy/shared';
import { extractImagePlaceholderKeys } from '@properfy/shared';
import { ValidationError, UnprocessableEntityError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { INotificationTemplateRepository } from '../../domain/notification-template.repository';
import type { TemplateRendererService } from '../../domain/template-renderer.service';
import type { IHtmlSanitizerService } from '../../domain/html-sanitizer.service';
import type { IHtmlToTextService } from '../../domain/html-to-text.service';
import type { IEmailAssetRepository } from '../../domain/email-asset.repository';
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
  bodyHtml: string;
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
  bodyHtml: string;
  bodyText: string;
  imageBindings: Array<{ id: string; placeholderKey: string; assetId: string; publicUrl: string; altText: string | null; width: number | null; height: number | null }>;
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
    private readonly htmlSanitizer?: IHtmlSanitizerService,
    private readonly htmlToText?: IHtmlToTextService,
    private readonly emailAssetRepo?: IEmailAssetRepository,
  ) {}

  async execute(input: UpsertNotificationTemplateInput): Promise<UpsertNotificationTemplateOutput> {
    const { actor } = input;

    // 1. Authorization — initial role gate
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'config.notification_templates',
      entityType: 'NotificationTemplate',
    });

    // 2. Tenant resolution — constitution §II: AM/OP resolve from input; CL_ADMIN is pinned
    let tenantId: string | null;
    if (actor.role === 'AM') {
      tenantId = input.tenantId ?? null;
    } else if (actor.role === 'OP') {
      tenantId = input.tenantId ?? actor.tenantId ?? null;
    } else {
      // CL_ADMIN: always pinned to actor's tenant
      tenantId = actor.tenantId;
    }

    // 3. Validate templateCode
    if (!MANDATORY_TEMPLATE_CODES.includes(input.templateCode as typeof MANDATORY_TEMPLATE_CODES[number])) {
      throw new ValidationError('Invalid template code');
    }

    // 4. Validate channel
    if (!VALID_CHANNELS.includes(input.channel as NotificationChannel)) {
      throw new ValidationError('Invalid notification channel');
    }

    // 5. Resolve notification classification (FR-004, FR-005)
    const protectedClass = getProtectedClass(input.templateCode);
    let resolvedClass: NotificationClass;
    if (protectedClass) {
      if (input.notificationClass && input.notificationClass !== protectedClass) {
        throw new ProtectedTemplateClassificationError(input.templateCode, protectedClass);
      }
      resolvedClass = protectedClass;
    } else {
      resolvedClass = input.notificationClass ?? getDefaultClass(input.templateCode);
    }

    // 6. Sanitizer save-profile validation (EMAIL channel only — SMS uses plain text)
    if (input.channel.toUpperCase() === 'EMAIL' && this.htmlSanitizer) {
      const sanitizeResult = this.htmlSanitizer.validateForSave(input.bodyHtml);
      if (!sanitizeResult.safe) {
        throw new UnprocessableEntityError(
          sanitizeResult.rejectedReason ?? 'Body contains disallowed HTML constructs',
          [{ code: 'custom', message: sanitizeResult.rejectedReason ?? 'Unsafe HTML', path: 'bodyHtml' }],
        );
      }
    }

    // 7. Validate {{image:key}} placeholders — reject unknown keys
    const imagePlaceholderKeys = extractImagePlaceholderKeys(input.bodyHtml);
    if (imagePlaceholderKeys.length > 0) {
      if (!this.emailAssetRepo) {
        // No asset repo available (US2 not yet wired) — reject any image placeholders
        throw new ValidationError(
          `Unknown image placeholder keys: ${imagePlaceholderKeys.join(', ')}`,
          imagePlaceholderKeys.map((k) => ({
            code: 'custom' as const,
            message: `Unknown image key: ${k}`,
            path: ['bodyHtml'],
          })),
        );
      }
      // Validate each key against the asset repository
      const unknownKeys: string[] = [];
      for (const key of imagePlaceholderKeys) {
        const asset = await this.emailAssetRepo.findByPlaceholderKey(tenantId, key);
        if (!asset || asset.status !== 'VERIFIED') {
          unknownKeys.push(key);
        }
      }
      if (unknownKeys.length > 0) {
        throw new ValidationError(
          `Unknown image placeholder keys: ${unknownKeys.join(', ')}`,
          unknownKeys.map((k) => ({
            code: 'custom' as const,
            message: `Unknown or unverified image key: ${k}`,
            path: ['bodyHtml'],
          })),
        );
      }
    }

    // 8. Derive bodyText from HTML (EMAIL channel)
    const bodyText =
      input.channel.toUpperCase() === 'EMAIL' && this.htmlToText
        ? this.htmlToText.convert(input.bodyHtml)
        : input.bodyHtml;

    // 9. Extract Handlebars variables (from bodyHtml + subject)
    const allVariables = new Set<string>();
    for (const variable of this.templateRenderer.extractVariables(input.bodyHtml)) {
      allVariables.add(variable);
    }
    if (input.subject) {
      for (const variable of this.templateRenderer.extractVariables(input.subject)) {
        allVariables.add(variable);
      }
    }
    const variablesJson = [...allVariables];

    // 10. Load existing template for audit before-state
    const existing = await this.templateRepo.findByTenantCodeChannel(
      tenantId,
      input.templateCode,
      input.channel as NotificationChannel,
    );

    // 11. Build entity
    const now = new Date();
    const template = new NotificationTemplateEntity({
      id: existing?.id ?? crypto.randomUUID(),
      tenantId,
      templateCode: input.templateCode,
      channel: input.channel as NotificationChannel,
      subject: input.subject ?? null,
      bodyHtml: input.bodyHtml,
      bodyText,
      variablesJson,
      isActive: input.isActive,
      notificationClass: resolvedClass,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    await this.templateRepo.upsert(template);

    // 12. Audit with before/after body (FR-011)
    this.auditService.log({
      action: 'NOTIFICATION_TEMPLATE_UPSERTED',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'NOTIFICATION_TEMPLATE',
      entityId: template.id,
      tenantId: tenantId ?? undefined,
      before: existing
        ? { templateCode: existing.templateCode, channel: existing.channel, bodyHtml: existing.bodyHtml }
        : null,
      after: {
        templateCode: template.templateCode,
        channel: template.channel,
        isActive: template.active,
        bodyHtml: template.bodyHtml,
      },
    });

    return {
      id: template.id,
      tenantId: template.tenantId,
      templateCode: template.templateCode,
      channel: template.channel,
      subject: template.subject,
      bodyHtml: template.bodyHtml ?? '',
      bodyText: template.bodyText,
      imageBindings: [],
      isActive: template.active,
      notificationClass: template.notificationClass,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }
}
