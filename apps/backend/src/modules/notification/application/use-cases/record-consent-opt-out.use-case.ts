import { randomUUID } from 'node:crypto';
import { toE164Au, type AuthContext, type NotificationChannel } from '@properfy/shared';
import type { INotificationConsentRepository } from '../../domain/notification-consent.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { ValidationError } from '../../../../shared/domain/errors';
import { NotificationConsentEntity } from '../../domain/notification-consent.entity';
import type { ConsentRecordOutput } from './list-consents-by-recipient.use-case';

export interface RecordConsentOptOutInput {
  tenantId: string;
  recipient: string;
  channel: NotificationChannel;
  reason: string;
  actor: AuthContext;
}

/**
 * F06 L-F06-03: manual AM/OP opt-out for an OPERATIONAL tenant recipient.
 *
 * The arrival-time notices are factual-service messages (no "reply STOP"
 * footer), so the only compliant stop mechanism is an operator recording the
 * opt-out here. Mirrors {@link OverrideConsentUseCase} (same deps, same RBAC +
 * tenant scope); reuses the existing `operator_override` change source (no
 * migration). Serves every OPERATIONAL tenant notice, not only F06.
 *
 * The recipient is normalized to the exact value the send pipeline passes to
 * `findByScope` (E.164 phone / lowercased email — the stored contact shape), so
 * the opt-out actually blocks the next send.
 */
export class RecordConsentOptOutUseCase {
  constructor(
    private readonly consentRepo: INotificationConsentRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: RecordConsentOptOutInput): Promise<ConsentRecordOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'consent.operator_opt_out',
      entityType: 'NotificationConsent',
    });

    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError('reason is required for consent opt-out');
    }
    if (reason.length > 1000) {
      throw new ValidationError('reason must be 1000 characters or less');
    }

    this.authorizationService.assertTenantScope(input.actor, input.tenantId, {
      action: 'consent.operator_opt_out',
      entityType: 'NotificationConsent',
    });

    const recipient = normalizeRecipient(input.recipient, input.channel);
    // An SMS recipient that cannot be put in the pipeline's E.164 form would be
    // stored as a value no send ever matches — a silent non-block. Reject it so
    // the operator fixes the number instead of getting false protection.
    if (input.channel === 'SMS' && toE164Au(input.recipient.trim()) === null) {
      throw new ValidationError('recipient is not a valid Australian mobile number');
    }

    const existing = await this.consentRepo.findByScope({
      tenantId: input.tenantId,
      recipient,
      channel: input.channel,
      notificationClass: 'OPERATIONAL',
    });

    // Already opted out → idempotent: return the record without a write or audit.
    if (existing?.optedOut) {
      return toOutput(existing);
    }

    const now = new Date();
    const consent =
      existing ??
      new NotificationConsentEntity({
        id: randomUUID(),
        recipient,
        channel: input.channel,
        tenantId: input.tenantId,
        notificationClass: 'OPERATIONAL',
        optedOut: false,
        optedOutAt: null,
        changeSource: null,
        changedAt: null,
        changedByUserId: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      });

    const before = existing
      ? {
          optedOut: existing.optedOut,
          optedOutAt: existing.optedOutAt,
          changeSource: existing.changeSource,
          reason: existing.reason,
        }
      : null;

    consent.markOptedOut('operator_override', input.actor.userId, reason);
    await this.consentRepo.upsert(consent);

    this.auditService.log({
      action: 'consent.operator_opted_out',
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'NotificationConsent',
      entityId: consent.id,
      tenantId: consent.tenantId,
      before,
      after: {
        optedOut: consent.optedOut,
        optedOutAt: consent.optedOutAt,
        changeSource: consent.changeSource,
        reason: consent.reason,
      },
      reason,
    });

    return toOutput(consent);
  }
}

function normalizeRecipient(recipient: string, channel: NotificationChannel): string {
  const trimmed = recipient.trim();
  if (channel === 'SMS') {
    // Phones are stored canonical E.164, so match that (callers reject unparseable).
    return toE164Au(trimmed) ?? trimmed;
  }
  // Email is canonicalized to lowercase (F06-2): the consent repository lowercases
  // EMAIL recipients on both write and lookup, so the send pipeline's
  // `isBlockedByConsent` matches regardless of the casing of the contact's snapshot
  // email. We lowercase here too so the returned `ConsentRecordOutput.recipient`
  // reflects the stored value.
  return trimmed.toLowerCase();
}

function toOutput(consent: NotificationConsentEntity): ConsentRecordOutput {
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
