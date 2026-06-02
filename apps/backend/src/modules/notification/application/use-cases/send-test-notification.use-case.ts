import type { AuthContext } from '@properfy/shared';
import { TEMPLATE_VARIABLES, SAMPLE_DATA, type AllowedVariable } from '@properfy/shared';
import { ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { INotificationTemplateRepository } from '../../domain/notification-template.repository';
import type { TemplateRendererService } from '../../domain/template-renderer.service';
import type { IEmailProvider, ISmsProvider } from '../../domain/providers';
import { NotificationForbiddenError, TemplateNotFoundError } from '../../domain/notification.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface SendTestNotificationInput {
  templateCode: string;
  channel: 'EMAIL' | 'SMS';
  recipient: string;
  actor: AuthContext;
}

export interface SendTestNotificationOutput {
  messageId: string;
  recipient: string;
  sentAt: Date;
}

export class SendTestNotificationUseCase {
  constructor(
    private readonly templateRepo: INotificationTemplateRepository,
    private readonly templateRenderer: TemplateRendererService,
    private readonly emailProvider: IEmailProvider,
    private readonly smsProvider: ISmsProvider,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    /** Comma-separated list of allowed test-send recipients. Empty = no restriction (dev). */
    private readonly recipientAllowlist?: string,
  ) {}

  async execute(input: SendTestNotificationInput): Promise<SendTestNotificationOutput> {
    const { actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'config.notification_templates',
      entityType: 'NotificationTemplate',
    });

    // Feature 030: enforce recipient allowlist for test-send in shared environments (FR-027a)
    if (this.recipientAllowlist && input.channel === 'EMAIL') {
      const allowedAddresses = this.recipientAllowlist
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (allowedAddresses.length > 0 && !allowedAddresses.includes(input.recipient.toLowerCase())) {
        throw new ForbiddenError(
          'RECIPIENT_NOT_ALLOWED',
          `Recipient '${input.recipient}' is not in the test-send allowlist. Use a safe test inbox.`,
        );
      }
    }

    let tenantId: string | null;
    if (actor.role === 'AM') {
      tenantId = null;
    } else if (actor.role === 'OP') {
      if (!actor.tenantId) throw new NotificationForbiddenError();
      tenantId = actor.tenantId;
    } else {
      if (!actor.tenantId) throw new NotificationForbiddenError();
      tenantId = actor.tenantId;
    }

    if (input.channel !== 'EMAIL' && input.channel !== 'SMS') {
      throw new ValidationError('Test send only supports EMAIL or SMS channel');
    }

    let template = await this.templateRepo.findByTenantCodeChannel(tenantId, input.templateCode, input.channel);
    if (!template && tenantId !== null) {
      template = await this.templateRepo.findByTenantCodeChannel(null, input.templateCode, input.channel);
    }
    if (!template) {
      throw new TemplateNotFoundError();
    }

    const spec = TEMPLATE_VARIABLES[input.templateCode as keyof typeof TEMPLATE_VARIABLES];
    const varKeys = spec ? [...spec.required, ...spec.optional] : [];
    const vars: Record<string, string> = {};
    for (const key of varKeys) {
      const sample = SAMPLE_DATA[key as AllowedVariable];
      if (sample !== undefined) vars[key] = sample;
    }

    let messageId: string;

    if (input.channel === 'EMAIL') {
      const renderedSubject = template.subject
        ? this.templateRenderer.render(template.subject, vars)
        : '';
      const renderedBodyHtml = template.bodyHtml
        ? this.templateRenderer.render(template.bodyHtml, vars)
        : undefined;
      const renderedBodyText = this.templateRenderer.render(template.bodyText, vars);
      ({ messageId } = await this.emailProvider.send(
        input.recipient,
        renderedSubject,
        renderedBodyHtml ?? renderedBodyText,
        renderedBodyText,
      ));
    } else {
      const renderedBodyText = this.templateRenderer.render(template.bodyText, vars);
      if (renderedBodyText.trim().length === 0) {
        throw new ValidationError('Rendered SMS body is empty');
      }
      ({ messageId } = await this.smsProvider.send(input.recipient, renderedBodyText));
    }

    const sentAt = new Date();

    this.auditService.log({
      action: 'NOTIFICATION_TEMPLATE_TEST_SENT',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'NOTIFICATION_TEMPLATE',
      entityId: template.id,
      tenantId: tenantId ?? undefined,
      after: {
        templateCode: input.templateCode,
        channel: input.channel,
        recipient: input.recipient,
        messageId,
      },
    });

    return { messageId, recipient: input.recipient, sentAt };
  }
}
