import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NotificationChannel } from '@properfy/shared';
import type { INotificationConsentRepository } from '../../domain/notification-consent.repository';
import { NotificationConsentEntity } from '../../domain/notification-consent.entity';
import { DomainError } from '../../../../shared/domain/errors';

export class InvalidUnsubscribeTokenError extends DomainError {
  constructor() {
    super('INVALID_UNSUBSCRIBE_TOKEN', 'The unsubscribe token is invalid or expired', 400);
  }
}

export interface ProcessUnsubscribeInput {
  token: string;
}

export interface ProcessUnsubscribeOutput {
  recipient: string;
  channel: NotificationChannel;
  tenantId: string;
}

/**
 * Generates a signed unsubscribe token containing recipient, channel, and tenant.
 * Format: base64url(JSON({recipient, channel, tenantId})).signature
 */
export function generateUnsubscribeToken(
  recipient: string,
  channel: NotificationChannel,
  tenantId: string,
  secret: string,
): string {
  const payload = JSON.stringify({ recipient, channel, tenantId });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const signature = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

/**
 * Generates the full unsubscribe URL to embed in email templates.
 */
export function buildUnsubscribeUrl(
  baseUrl: string,
  recipient: string,
  channel: NotificationChannel,
  tenantId: string,
  secret: string,
): string {
  const token = generateUnsubscribeToken(recipient, channel, tenantId, secret);
  return `${baseUrl}/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
}

export class ProcessUnsubscribeUseCase {
  constructor(
    private readonly consentRepo: INotificationConsentRepository,
    private readonly secret: string,
  ) {}

  async execute(input: ProcessUnsubscribeInput): Promise<ProcessUnsubscribeOutput> {
    const parts = input.token.split('.');
    if (parts.length !== 2) {
      throw new InvalidUnsubscribeTokenError();
    }

    const [payloadB64, signature] = parts;
    if (!payloadB64 || !signature) {
      throw new InvalidUnsubscribeTokenError();
    }

    // Verify HMAC signature using timing-safe comparison
    const expectedSignature = createHmac('sha256', this.secret)
      .update(payloadB64)
      .digest('base64url');

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new InvalidUnsubscribeTokenError();
    }

    // Decode and parse payload
    let parsed: { recipient?: string; channel?: string; tenantId?: string };
    try {
      const decoded = Buffer.from(payloadB64, 'base64url').toString('utf-8');
      parsed = JSON.parse(decoded);
    } catch {
      throw new InvalidUnsubscribeTokenError();
    }

    const { recipient, channel, tenantId } = parsed;
    if (!recipient || !channel || !tenantId) {
      throw new InvalidUnsubscribeTokenError();
    }

    // Validate channel
    const validChannels: NotificationChannel[] = ['EMAIL', 'SMS', 'WHATSAPP'];
    if (!validChannels.includes(channel as NotificationChannel)) {
      throw new InvalidUnsubscribeTokenError();
    }

    const typedChannel = channel as NotificationChannel;

    // Upsert the consent record to mark as opted out
    const existing = await this.consentRepo.findByRecipientChannelTenant(
      recipient,
      typedChannel,
      tenantId,
    );

    if (existing) {
      existing.markOptedOut();
      await this.consentRepo.upsert(existing);
    } else {
      const now = new Date();
      const consent = new NotificationConsentEntity({
        id: randomUUID(),
        recipient,
        channel: typedChannel,
        tenantId,
        optedOut: true,
        optedOutAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await this.consentRepo.upsert(consent);
    }

    return { recipient, channel: typedChannel, tenantId };
  }
}
