import type { AuthContext, NotificationChannel } from '@properfy/shared';
import { NotFoundError, ValidationError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { INotificationTemplateRepository } from '../../domain/notification-template.repository';
import { MANDATORY_TEMPLATE_CODES } from '../../domain/notification.constants';
import { PLATFORM_TEMPLATES } from '../../domain/platform-notification-templates';

const VALID_CHANNELS: NotificationChannel[] = ['EMAIL', 'SMS'];

export interface GetTemplateDefaultInput {
  templateCode: string;
  channel: string;
  /** Present when the caller is editing an agency override. */
  tenantId?: string;
  actor: AuthContext;
}

export interface GetTemplateDefaultOutput {
  subject: string | null;
  /** The editable body: plain text for SMS, HTML for EMAIL. */
  body: string;
  /** Where the content came from, so the UI can word the confirmation. */
  source: 'PLATFORM_DEFAULT' | 'FACTORY';
}

/**
 * Answers "what should this template reset to?" — always the level above the
 * scope being edited:
 *
 *   agency override (tenantId given) -> the platform default row in the database
 *   platform default (no tenantId)   -> the factory seed catalog shipped in code
 *
 * The platform-default arm falls back to the factory catalog when the row is
 * absent, which is the state of any environment where the one-shot platform seed
 * has not been run yet.
 *
 * Note the platform default is tenant-agnostic (tenant_id IS NULL), so this never
 * reads another agency's override — `tenantId` only selects WHICH level to
 * return, it is never used as a lookup key.
 */
export class GetTemplateDefaultUseCase {
  constructor(
    private readonly templateRepo: INotificationTemplateRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: GetTemplateDefaultInput): Promise<GetTemplateDefaultOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'config.notification_templates',
      entityType: 'NotificationTemplate',
    });

    if (!MANDATORY_TEMPLATE_CODES.includes(input.templateCode as typeof MANDATORY_TEMPLATE_CODES[number])) {
      throw new ValidationError('Invalid template code');
    }
    if (!VALID_CHANNELS.includes(input.channel as NotificationChannel)) {
      throw new ValidationError('Invalid notification channel');
    }

    const channel = input.channel as NotificationChannel;
    const isEmail = channel === 'EMAIL';

    // Editing an agency override: the platform default is what it reverts to.
    if (input.tenantId) {
      const platform = await this.templateRepo.findByTenantCodeChannel(null, input.templateCode, channel);
      if (platform) {
        return {
          subject: platform.subject,
          body: (isEmail ? platform.bodyHtml : platform.bodyText) ?? platform.bodyText,
          source: 'PLATFORM_DEFAULT',
        };
      }
    }

    const seed = PLATFORM_TEMPLATES.find((t) => t.code === input.templateCode && t.channel === channel);
    if (!seed) {
      throw new NotFoundError(
        'TEMPLATE_DEFAULT_NOT_FOUND',
        `No default content exists for ${input.templateCode} on ${channel}`,
      );
    }

    return {
      subject: seed.subject,
      // Mirrors the seeder's derivation exactly (seed-platform-notification-templates.ts),
      // so a reset yields the same content a freshly seeded row would hold.
      body: isEmail ? seed.bodyHtml ?? `<p>${seed.body}</p>` : seed.body,
      source: 'FACTORY',
    };
  }
}
