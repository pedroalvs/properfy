import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NotificationChannel, NotificationClass } from '@properfy/shared';

/**
 * Feature 018 US1: domain service that generates, signs, and verifies
 * unsubscribe tokens used in operational email footers.
 *
 * Tokens are HMAC-SHA256 signed and contain:
 *   - recipient (email or phone)
 *   - channel (EMAIL/SMS/WHATSAPP)
 *   - tenantId
 *   - notificationClass (OPERATIONAL or MARKETING — TRANSACTIONAL is never unsubscribable)
 *   - iat (issued-at, seconds since epoch)
 *   - exp (expiry, seconds since epoch; default 30 days)
 *
 * Verification is timing-safe and rejects expired, malformed, or tampered tokens
 * with a specific reason code so the render-page use case can show a friendly
 * "link expired" message instead of a generic 400 error.
 */

export interface UnsubscribeTokenPayload {
  recipient: string;
  channel: NotificationChannel;
  tenantId: string;
  notificationClass: NotificationClass;
  iat: number;
  exp: number;
}

export type VerifyResult =
  | { valid: true; payload: UnsubscribeTokenPayload }
  | { valid: false; reason: 'malformed' | 'invalid_signature' | 'expired' | 'invalid_payload' };

/** Default token lifetime: 30 days in seconds. */
export const DEFAULT_UNSUBSCRIBE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface GenerateTokenInput {
  recipient: string;
  channel: NotificationChannel;
  tenantId: string;
  notificationClass?: NotificationClass; // defaults to OPERATIONAL
  ttlSeconds?: number; // defaults to 30 days
  now?: Date; // testability
}

export class UnsubscribeTokenService {
  constructor(private readonly secret: string) {
    if (!secret || secret.length < 16) {
      throw new Error('UnsubscribeTokenService requires a secret of at least 16 characters');
    }
  }

  generate(input: GenerateTokenInput): string {
    const now = input.now ?? new Date();
    const iat = Math.floor(now.getTime() / 1000);
    const ttl = input.ttlSeconds ?? DEFAULT_UNSUBSCRIBE_TOKEN_TTL_SECONDS;
    const payload: UnsubscribeTokenPayload = {
      recipient: input.recipient,
      channel: input.channel,
      tenantId: input.tenantId,
      notificationClass: input.notificationClass ?? 'OPERATIONAL',
      iat,
      exp: iat + ttl,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.sign(payloadB64);
    return `${payloadB64}.${signature}`;
  }

  buildUrl(baseUrl: string, input: GenerateTokenInput): string {
    const token = this.generate(input);
    return `${baseUrl.replace(/\/$/, '')}/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  verify(token: string, now: Date = new Date()): VerifyResult {
    if (!token || typeof token !== 'string') {
      return { valid: false, reason: 'malformed' };
    }
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, reason: 'malformed' };
    }
    const [payloadB64, signature] = parts;
    if (!payloadB64 || !signature) {
      return { valid: false, reason: 'malformed' };
    }

    const expectedSignature = this.sign(payloadB64);
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, reason: 'invalid_signature' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    } catch {
      return { valid: false, reason: 'malformed' };
    }

    if (!isValidPayloadShape(parsed)) {
      return { valid: false, reason: 'invalid_payload' };
    }

    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (parsed.exp <= nowSeconds) {
      return { valid: false, reason: 'expired' };
    }

    return { valid: true, payload: parsed };
  }

  private sign(payloadB64: string): string {
    return createHmac('sha256', this.secret).update(payloadB64).digest('base64url');
  }
}

function isValidPayloadShape(value: unknown): value is UnsubscribeTokenPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.recipient !== 'string' || !v.recipient) return false;
  if (v.channel !== 'EMAIL' && v.channel !== 'SMS' && v.channel !== 'WHATSAPP') return false;
  if (typeof v.tenantId !== 'string' || !v.tenantId) return false;
  if (
    v.notificationClass !== 'OPERATIONAL' &&
    v.notificationClass !== 'MARKETING' &&
    v.notificationClass !== 'TRANSACTIONAL'
  ) {
    return false;
  }
  if (typeof v.iat !== 'number' || typeof v.exp !== 'number') return false;
  return true;
}
