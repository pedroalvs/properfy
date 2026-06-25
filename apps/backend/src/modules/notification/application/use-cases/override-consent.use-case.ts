import type { AuthContext } from '@properfy/shared';
import type { INotificationConsentRepository } from '../../domain/notification-consent.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { NotificationConsentNotFoundError } from '../../domain/notification.errors';
import { ValidationError } from '../../../../shared/domain/errors';
import type { ConsentRecordOutput } from './list-consents-by-recipient.use-case';

export interface OverrideConsentInput {
  consentId: string;
  reason: string;
  actor: AuthContext;
}

/**
 * Feature 018 US4: operator override of a recipient's opt-out state.
 *
 * Flips an existing consent record from opted-out back to opted-in with a
 * mandatory reason (recorded for audit). AM can override any tenant; OP is
 * scoped to its own tenant.
 */
export class OverrideConsentUseCase {
  constructor(
    private readonly consentRepo: INotificationConsentRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: OverrideConsentInput): Promise<ConsentRecordOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'consent.override',
      entityType: 'NotificationConsent',
      entityId: input.consentId,
    });

    if (!input.reason || !input.reason.trim()) {
      throw new ValidationError('reason is required for consent override');
    }
    if (input.reason.length > 1000) {
      throw new ValidationError('reason must be 1000 characters or less');
    }

    const consent = await this.consentRepo.findById(input.consentId);
    if (!consent) {
      throw new NotificationConsentNotFoundError();
    }

    this.authorizationService.assertTenantScope(input.actor, consent.tenantId, {
      action: 'consent.override',
      entityType: 'NotificationConsent',
      entityId: input.consentId,
    });

    const beforeSnapshot = {
      optedOut: consent.optedOut,
      optedOutAt: consent.optedOutAt,
      changeSource: consent.changeSource,
      reason: consent.reason,
    };

    consent.markOptedIn('operator_override', input.actor.userId, input.reason);
    await this.consentRepo.upsert(consent);

    this.auditService.log({
      action: 'consent.override_opted_in',
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'NotificationConsent',
      entityId: consent.id,
      tenantId: consent.tenantId,
      before: beforeSnapshot,
      after: {
        optedOut: consent.optedOut,
        optedOutAt: consent.optedOutAt,
        changeSource: consent.changeSource,
        reason: consent.reason,
      },
      reason: input.reason,
    });

    return {
      id: consent.id,
      recipient: consent.recipient,
      channel: consent.channel,
      tenantId: consent.tenantId,
      notificationClass: consent.notificationClass,
      optedOut: consent.optedOut,
      optedOutAt: consent.optedOutAt,
      changeSource: consent.changeSource,
      changedAt: consent.changedAt,
      changedByUserId: consent.changedByUserId,
      reason: consent.reason,
      createdAt: consent.createdAt,
      updatedAt: consent.updatedAt,
    };
  }
}
