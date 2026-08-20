import { randomUUID } from 'node:crypto';
import type { AuthContext } from '@properfy/shared';
import { prepareSmsBody } from '../../domain/sms-content';
import { TEMPLATE_VARIABLES, SAMPLE_DATA, isSystemTemplate, type AllowedVariable } from '@properfy/shared';
import { ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { INotificationTemplateRepository } from '../../domain/notification-template.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { TemplateRendererService } from '../../domain/template-renderer.service';
import type { IHtmlSanitizerService } from '../../domain/html-sanitizer.service';
import type { IHtmlToTextService } from '../../domain/html-to-text.service';
import type { IEmailProvider, ISmsProvider } from '../../domain/providers';
import { NotificationForbiddenError, TemplateNotFoundError } from '../../domain/notification.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { renderEmailBody } from '../render-email-body';

export interface SendTestNotificationInput {
  templateCode: string;
  channel: 'EMAIL' | 'SMS';
  recipient: string;
  /**
   * Tenant scope of the template under test. AM/OP may target any tenant (the
   * agency override open in the editor); omitted = the actor's own scope (AM:
   * platform, OP: own tenant or platform). CL_ADMIN is pinned to its tenant.
   */
  tenantId?: string;
  /** Unsaved editor draft — when present, sent instead of the persisted row. */
  draftSubject?: string;
  draftBodyHtml?: string;
  draftBodyText?: string;
  actor: AuthContext;
}

export interface SendTestNotificationOutput {
  messageId: string;
  recipient: string;
  sentAt: Date;
}

export interface TestRecipientAllowlists {
  /** Comma-separated allowed test emails. Empty = no restriction (dev). */
  email?: string;
  /** Comma-separated allowed test phone numbers (E.164). Empty = no restriction. */
  sms?: string;
}

function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export class SendTestNotificationUseCase {
  constructor(
    private readonly templateRepo: INotificationTemplateRepository,
    private readonly templateRenderer: TemplateRendererService,
    private readonly emailProvider: IEmailProvider,
    private readonly smsProvider: ISmsProvider,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly allowlists?: TestRecipientAllowlists,
    /** Render pipeline deps (sanitize → html-to-text) */
    private readonly renderDeps?: {
      htmlSanitizer?: IHtmlSanitizerService;
      htmlToText?: IHtmlToTextService;
    },
    /**
     * Used to resolve the agency's real logo/name/phone when testing an agency
     * override, so the test email matches the real send (and the preview)
     * instead of the platform SAMPLE_DATA placeholders.
     */
    private readonly tenantRepo?: Pick<ITenantRepository, 'findById'>,
  ) {}

  async execute(input: SendTestNotificationInput): Promise<SendTestNotificationOutput> {
    const { actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'config.notification_templates',
      entityType: 'NotificationTemplate',
    });

    if (input.channel !== 'EMAIL' && input.channel !== 'SMS') {
      throw new ValidationError('Test send only supports EMAIL or SMS channel');
    }

    // Feature 030: enforce recipient allowlist for test-send in shared environments (FR-027a)
    const allowlist = parseAllowlist(
      input.channel === 'EMAIL' ? this.allowlists?.email : this.allowlists?.sms,
    );
    // SMS fails closed: unlike email (dev convenience, free), an SMS test costs
    // money and lands on a real phone, so it is refused until an allowlist is
    // explicitly configured (SMS_TEST_RECIPIENT_ALLOWLIST).
    if (input.channel === 'SMS' && allowlist.length === 0) {
      throw new ForbiddenError(
        'RECIPIENT_NOT_ALLOWED',
        'SMS test-send is disabled: configure SMS_TEST_RECIPIENT_ALLOWLIST with the allowed test numbers.',
      );
    }
    if (allowlist.length > 0 && !allowlist.includes(input.recipient.toLowerCase())) {
      throw new ForbiddenError(
        'RECIPIENT_NOT_ALLOWED',
        `Recipient '${input.recipient}' is not in the test-send allowlist. Use a safe test recipient.`,
      );
    }

    // Scope resolution: AM/OP are cross-tenant and may target the tenant of the
    // template open in the editor; CL_ADMIN is pinned to its own tenant.
    let tenantId: string | null;
    if (actor.role === 'AM' || actor.role === 'OP') {
      tenantId = input.tenantId ?? (actor.role === 'OP' ? (actor.tenantId ?? null) : null);
    } else {
      if (!actor.tenantId) throw new NotificationForbiddenError();
      if (input.tenantId && input.tenantId !== actor.tenantId) throw new NotificationForbiddenError();
      tenantId = actor.tenantId;
    }

    // A draft subject alone is still a draft: the operator is testing this
    // override's on-screen content, so it must not fall back to the platform row.
    const hasDraft =
      input.channel === 'EMAIL'
        ? input.draftBodyHtml !== undefined || input.draftSubject !== undefined
        : input.draftBodyText !== undefined;
    // A body draft is the only thing that can replace a missing persisted row.
    const hasDraftBody =
      input.channel === 'EMAIL' ? input.draftBodyHtml !== undefined : input.draftBodyText !== undefined;

    let template = await this.templateRepo.findByTenantCodeChannel(tenantId, input.templateCode, input.channel);
    // Without a draft the test must mirror the real send's resolution, which
    // also skips an INACTIVE override. A draft is tested as-is: the operator is
    // explicitly exercising the content on screen.
    if (tenantId !== null && (!template || (!hasDraft && !template.isActive()))) {
      template = await this.templateRepo.findByTenantCodeChannel(null, input.templateCode, input.channel);
    }
    if (!template && !hasDraftBody) {
      throw new TemplateNotFoundError();
    }

    if (input.draftBodyHtml !== undefined && this.renderDeps?.htmlSanitizer) {
      const result = this.renderDeps.htmlSanitizer.validateForSave(input.draftBodyHtml);
      if (!result.safe) {
        throw new ValidationError(result.rejectedReason ?? 'Draft body contains disallowed HTML.');
      }
    }

    const spec = TEMPLATE_VARIABLES[input.templateCode as keyof typeof TEMPLATE_VARIABLES];
    const varKeys = spec ? [...spec.required, ...spec.optional] : [];
    const vars: Record<string, string> = {};
    for (const key of varKeys) {
      const sample = SAMPLE_DATA[key as AllowedVariable];
      if (sample !== undefined) vars[key] = sample;
    }

    // Agency override under test: replace the platform SAMPLE_DATA placeholders
    // (agencyLogoUrl defaults to the PROPERFY logo) with the tenant's real
    // branding, mirroring the real send (BuildNotificationPayloadService) and
    // the preview — otherwise the test email shows the Properfy logo instead of
    // the agency's. Only keys the template actually declares are overridden.
    if (tenantId !== null && this.tenantRepo) {
      const tenant = await this.tenantRepo.findById(tenantId);
      if (tenant) {
        const settings = tenant.settingsJson ?? {};
        if ('agencyName' in vars) vars.agencyName = tenant.name;
        if ('agencyLogoUrl' in vars) {
          vars.agencyLogoUrl = typeof settings.logoUrl === 'string' ? settings.logoUrl : '';
        }
        if ('agencyPhone' in vars) {
          vars.agencyPhone = typeof settings.contactPhone === 'string' ? settings.contactPhone : '';
        }
      }
    }

    let messageId: string;

    if (input.channel === 'EMAIL') {
      const { renderedSubject, renderedBodyHtml, renderedBodyText } = renderEmailBody(
        {
          channel: 'EMAIL',
          bodyHtmlSource: input.draftBodyHtml ?? template?.bodyHtml ?? '',
          bodyTextSource: template?.bodyText ?? '',
          subject: input.draftSubject ?? template?.subject ?? null,
          variables: vars,
        },
        {
          templateRenderer: this.templateRenderer,
          ...this.renderDeps,
        },
      );
      ({ messageId } = await this.emailProvider.send(
        input.recipient,
        renderedSubject,
        renderedBodyHtml || renderedBodyText,
        renderedBodyText,
        { identity: isSystemTemplate(input.templateCode) ? 'system' : 'inspection' },
      ));
    } else {
      const renderedBodyText = this.templateRenderer.render(
        input.draftBodyText ?? template?.bodyText ?? '',
        vars,
      );
      if (renderedBodyText.trim().length === 0) {
        throw new ValidationError('Rendered SMS body is empty');
      }
      const prepared = prepareSmsBody(renderedBodyText);
      ({ messageId } = await this.smsProvider.send(input.recipient, prepared.body, {
        idempotencyKey: `test-${randomUUID()}`,
        customRef: `test-${input.templateCode}`,
        enableUnicode: prepared.unicode,
      }));
    }

    const sentAt = new Date();

    this.auditService.log({
      action: 'NOTIFICATION_TEMPLATE_TEST_SENT',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'NOTIFICATION_TEMPLATE',
      entityId: template?.id ?? input.templateCode,
      tenantId: tenantId ?? undefined,
      after: {
        templateCode: input.templateCode,
        channel: input.channel,
        recipient: input.recipient,
        messageId,
        draft: hasDraft,
      },
    });

    return { messageId, recipient: input.recipient, sentAt };
  }
}
