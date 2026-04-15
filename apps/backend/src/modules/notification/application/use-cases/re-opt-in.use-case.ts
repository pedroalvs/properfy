import { randomUUID } from 'node:crypto';
import type { NotificationChannel, NotificationClass } from '@properfy/shared';
import type { INotificationConsentRepository } from '../../domain/notification-consent.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { NotificationConsentEntity } from '../../domain/notification-consent.entity';
import type { UnsubscribeTokenService } from '../../domain/unsubscribe-token.service';
import {
  InvalidUnsubscribeTokenError,
  type UnsubscribeTokenFailureReason,
} from './process-unsubscribe.use-case';

export interface ReOptInInput {
  token: string;
  requestId?: string;
  ipAddress?: string;
}

export interface ReOptInOutput {
  recipient: string;
  channel: NotificationChannel;
  tenantId: string;
  notificationClass: NotificationClass;
}

/**
 * Feature 018 US6: recipient re-subscribes via the confirmation page link.
 *
 * Uses the same HMAC-signed token as the unsubscribe flow. Flips the consent
 * record back to opted-in with `changeSource = 're_opt_in'`, writes an audit
 * record with action `consent.re_opted_in_via_link`.
 *
 * If no prior consent record exists (edge case: the token references a recipient
 * who was never opted out), a new opted-in record is still created for audit
 * traceability.
 */
export class ReOptInUseCase {
  constructor(
    private readonly consentRepo: INotificationConsentRepository,
    private readonly tokenService: UnsubscribeTokenService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: ReOptInInput): Promise<ReOptInOutput> {
    const result = this.tokenService.verify(input.token);
    if (!result.valid) {
      throw new InvalidUnsubscribeTokenError(result.reason as UnsubscribeTokenFailureReason);
    }

    const { recipient, channel, tenantId, notificationClass } = result.payload;

    if (notificationClass === 'TRANSACTIONAL') {
      throw new InvalidUnsubscribeTokenError('invalid_payload');
    }

    const existing = await this.consentRepo.findByScope({
      tenantId,
      recipient,
      channel,
      notificationClass,
    });

    const beforeSnapshot = existing
      ? {
          optedOut: existing.optedOut,
          optedOutAt: existing.optedOutAt,
          changeSource: existing.changeSource,
        }
      : null;

    let consent: NotificationConsentEntity;
    if (existing) {
      existing.markOptedIn('re_opt_in');
      consent = existing;
    } else {
      const now = new Date();
      consent = new NotificationConsentEntity({
        id: randomUUID(),
        recipient,
        channel,
        tenantId,
        notificationClass,
        optedOut: false,
        optedOutAt: null,
        changeSource: 're_opt_in',
        changedAt: now,
        changedByUserId: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    await this.consentRepo.upsert(consent);

    this.auditService.log({
      action: 'consent.re_opted_in_via_link',
      actorType: 'ANONYMOUS',
      entityType: 'NotificationConsent',
      entityId: consent.id,
      tenantId,
      before: beforeSnapshot,
      after: {
        optedOut: consent.optedOut,
        optedOutAt: consent.optedOutAt,
        changeSource: consent.changeSource,
      },
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      metadata: {
        recipient,
        channel,
        notificationClass,
      },
    });

    return { recipient, channel, tenantId, notificationClass };
  }
}
