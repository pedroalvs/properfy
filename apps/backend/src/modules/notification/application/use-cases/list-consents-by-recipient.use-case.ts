import type { AuthContext, NotificationChannel, NotificationClass, ConsentChangeSource } from '@properfy/shared';
import type { INotificationConsentRepository } from '../../domain/notification-consent.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { ValidationError } from '../../../../shared/domain/errors';

export interface ListConsentsByRecipientInput {
  recipient: string;
  tenantId?: string; // required for AM; ignored for OP (forced to actor.tenantId)
  channel?: NotificationChannel;
  actor: AuthContext;
}

export interface ConsentRecordOutput {
  id: string;
  recipient: string;
  channel: NotificationChannel;
  tenantId: string;
  notificationClass: NotificationClass;
  optedOut: boolean;
  optedOutAt: Date | null;
  changeSource: ConsentChangeSource | null;
  changedAt: Date | null;
  changedByUserId: string | null;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListConsentsByRecipientOutput {
  recipient: string;
  entries: ConsentRecordOutput[];
  skippedCount: number;
}

/**
 * Feature 018 US3: operator view of a recipient's consent status.
 *
 * Access:
 *   - AM: must provide `tenantId` explicitly (any tenant allowed)
 *   - OP: forced to the actor's own `tenantId` (any provided tenantId is ignored)
 *   - All other roles: 403
 */
export class ListConsentsByRecipientUseCase {
  constructor(
    private readonly consentRepo: INotificationConsentRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ListConsentsByRecipientInput): Promise<ListConsentsByRecipientOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'consent.list',
      entityType: 'NotificationConsent',
    });

    if (!input.recipient || !input.recipient.trim()) {
      throw new ValidationError('recipient is required');
    }

    let effectiveTenantId: string;
    if (input.actor.role === 'AM') {
      if (!input.tenantId) {
        throw new ValidationError('tenantId is required when querying as AM');
      }
      effectiveTenantId = input.tenantId;
    } else {
      // OP: forced to own tenant
      if (!input.actor.tenantId) {
        throw new ValidationError('Operator must have a tenant context');
      }
      effectiveTenantId = input.actor.tenantId;
    }

    const entries = await this.consentRepo.listByRecipient({
      tenantId: effectiveTenantId,
      recipient: input.recipient,
      channel: input.channel,
    });

    const skippedCount = await this.consentRepo.countSkippedForRecipient({
      tenantId: effectiveTenantId,
      recipient: input.recipient,
    });

    return {
      recipient: input.recipient,
      entries: entries.map((e) => ({
        id: e.id,
        recipient: e.recipient,
        channel: e.channel,
        tenantId: e.tenantId,
        notificationClass: e.notificationClass,
        optedOut: e.optedOut,
        optedOutAt: e.optedOutAt,
        changeSource: e.changeSource,
        changedAt: e.changedAt,
        changedByUserId: e.changedByUserId,
        reason: e.reason,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
      skippedCount,
    };
  }
}
