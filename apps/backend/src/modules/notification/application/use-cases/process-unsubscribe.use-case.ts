import { randomUUID } from 'node:crypto';
import type { NotificationChannel, NotificationClass } from '@properfy/shared';
import type { INotificationConsentRepository } from '../../domain/notification-consent.repository';
import { NotificationConsentEntity } from '../../domain/notification-consent.entity';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { DomainError } from '../../../../shared/domain/errors';
import { UnsubscribeTokenService } from '../../domain/unsubscribe-token.service';

export type UnsubscribeTokenFailureReason =
  | 'malformed'
  | 'invalid_signature'
  | 'expired'
  | 'invalid_payload';

export class InvalidUnsubscribeTokenError extends DomainError {
  constructor(public readonly reason: UnsubscribeTokenFailureReason) {
    super('INVALID_UNSUBSCRIBE_TOKEN', `The unsubscribe token is invalid or expired (${reason})`, 400);
  }
}

/**
 * @deprecated Use `UnsubscribeTokenService.generate()` instead. Kept for backwards
 * compatibility with existing call sites that built URLs without the token service.
 * Phase 5 of feature 018 migrates to the domain service.
 */
export function generateUnsubscribeToken(
  recipient: string,
  channel: NotificationChannel,
  tenantId: string,
  secret: string,
): string {
  const service = new UnsubscribeTokenService(secret);
  return service.generate({ recipient, channel, tenantId });
}

/**
 * @deprecated Use `UnsubscribeTokenService.buildUrl()` instead. Kept for the existing
 * send-worker call site at `send-notification.use-case.ts` until the container
 * migration is complete.
 */
export function buildUnsubscribeUrl(
  baseUrl: string,
  recipient: string,
  channel: NotificationChannel,
  tenantId: string,
  secret: string,
): string {
  const service = new UnsubscribeTokenService(secret);
  return service.buildUrl(baseUrl, { recipient, channel, tenantId });
}

export interface ProcessUnsubscribeInput {
  token: string;
  requestId?: string;
  ipAddress?: string;
}

export interface ProcessUnsubscribeOutput {
  recipient: string;
  channel: NotificationChannel;
  tenantId: string;
  notificationClass: NotificationClass;
}

/**
 * Feature 018 US1: process a public unsubscribe click.
 *
 * Flow:
 *   1. Verify the token via `UnsubscribeTokenService` (HMAC + expiry check).
 *   2. Load any existing consent record scoped to (tenant, recipient, channel, class).
 *   3. Flip it to opted-out with `changeSource = 'unsubscribe_link'` (or create it).
 *   4. Write one audit record per operation with action `consent.opted_out_via_link`.
 *
 * Idempotency: clicking the same link twice results in the same opted-out state and
 * writes two audit records (one per click) — this is intentional because each click
 * is a distinct user action with a distinct request id.
 */
export class ProcessUnsubscribeUseCase {
  constructor(
    private readonly consentRepo: INotificationConsentRepository,
    private readonly tokenService: UnsubscribeTokenService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: ProcessUnsubscribeInput): Promise<ProcessUnsubscribeOutput> {
    const result = this.tokenService.verify(input.token);
    if (!result.valid) {
      throw new InvalidUnsubscribeTokenError(result.reason);
    }

    const { recipient, channel, tenantId, notificationClass } = result.payload;

    // TRANSACTIONAL notifications must never be opt-outable — reject at the token
    // layer if somehow a token with TRANSACTIONAL class was issued.
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
      existing.markOptedOut('unsubscribe_link');
      consent = existing;
    } else {
      const now = new Date();
      consent = new NotificationConsentEntity({
        id: randomUUID(),
        recipient,
        channel,
        tenantId,
        notificationClass,
        optedOut: true,
        optedOutAt: now,
        changeSource: 'unsubscribe_link',
        changedAt: now,
        changedByUserId: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    await this.consentRepo.upsert(consent);

    this.auditService.log({
      action: 'consent.opted_out_via_link',
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
