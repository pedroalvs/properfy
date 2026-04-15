import { describe, it, expect } from 'vitest';
import {
  UnsubscribeTokenService,
  DEFAULT_UNSUBSCRIBE_TOKEN_TTL_SECONDS,
} from '../../../src/modules/notification/domain/unsubscribe-token.service';

describe('UnsubscribeTokenService', () => {
  const secret = 'test-secret-at-least-sixteen-characters';
  const baseInput = {
    recipient: 'user@example.com',
    channel: 'EMAIL' as const,
    tenantId: 'tenant-1',
    notificationClass: 'OPERATIONAL' as const,
  };

  it('rejects a secret shorter than 16 characters', () => {
    expect(() => new UnsubscribeTokenService('short')).toThrow();
  });

  it('generates and verifies a round-trip token', () => {
    const service = new UnsubscribeTokenService(secret);
    const token = service.generate(baseInput);

    const result = service.verify(token);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.recipient).toBe('user@example.com');
      expect(result.payload.channel).toBe('EMAIL');
      expect(result.payload.tenantId).toBe('tenant-1');
      expect(result.payload.notificationClass).toBe('OPERATIONAL');
      expect(result.payload.iat).toBeGreaterThan(0);
      expect(result.payload.exp).toBeGreaterThan(result.payload.iat);
    }
  });

  it('defaults notificationClass to OPERATIONAL when omitted', () => {
    const service = new UnsubscribeTokenService(secret);
    const token = service.generate({
      recipient: 'a@b.com',
      channel: 'EMAIL',
      tenantId: 't-1',
    });
    const result = service.verify(token);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.notificationClass).toBe('OPERATIONAL');
    }
  });

  it('defaults expiry to 30 days', () => {
    const service = new UnsubscribeTokenService(secret);
    const now = new Date('2026-04-01T00:00:00.000Z');
    const token = service.generate({ ...baseInput, now });
    const result = service.verify(token, now);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.exp - result.payload.iat).toBe(DEFAULT_UNSUBSCRIBE_TOKEN_TTL_SECONDS);
    }
  });

  it('rejects an expired token', () => {
    const service = new UnsubscribeTokenService(secret);
    const issuedAt = new Date('2026-01-01T00:00:00.000Z');
    const token = service.generate({ ...baseInput, now: issuedAt });

    const later = new Date('2026-02-02T00:00:00.000Z'); // > 30 days later
    const result = service.verify(token, later);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('expired');
    }
  });

  it('rejects a token with a tampered signature', () => {
    const service = new UnsubscribeTokenService(secret);
    const token = service.generate(baseInput);
    const [payloadB64] = token.split('.');
    const tampered = `${payloadB64}.tamperedsignature123456789`;

    const result = service.verify(tampered);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_signature');
    }
  });

  it('rejects a token signed with a different secret', () => {
    const service1 = new UnsubscribeTokenService(secret);
    const service2 = new UnsubscribeTokenService('a-different-secret-16-chars');
    const token = service1.generate(baseInput);

    const result = service2.verify(token);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_signature');
    }
  });

  it('rejects a malformed token with missing parts', () => {
    const service = new UnsubscribeTokenService(secret);

    const singlePart = service.verify('onlyonepart');
    expect(singlePart).toEqual({ valid: false, reason: 'malformed' });

    const threeParts = service.verify('a.b.c');
    expect(threeParts).toEqual({ valid: false, reason: 'malformed' });

    const empty = service.verify('');
    expect(empty).toEqual({ valid: false, reason: 'malformed' });
  });

  it('rejects a token with a payload shape mismatch', () => {
    const service = new UnsubscribeTokenService(secret);
    // Manually sign a payload that lacks required fields
    const badPayload = Buffer.from(JSON.stringify({ recipient: 'x' })).toString('base64url');
    // Sign it correctly so the signature check passes but payload shape fails
    const crypto = require('node:crypto') as typeof import('node:crypto');
    const sig = crypto.createHmac('sha256', secret).update(badPayload).digest('base64url');
    const token = `${badPayload}.${sig}`;

    const result = service.verify(token);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_payload');
    }
  });

  it('buildUrl returns a fully-qualified unsubscribe URL', () => {
    const service = new UnsubscribeTokenService(secret);
    const url = service.buildUrl('https://api.properfy.com', baseInput);
    expect(url.startsWith('https://api.properfy.com/v1/notifications/unsubscribe?token=')).toBe(true);
  });

  it('buildUrl strips a trailing slash from baseUrl', () => {
    const service = new UnsubscribeTokenService(secret);
    const url = service.buildUrl('https://api.properfy.com/', baseInput);
    expect(url.startsWith('https://api.properfy.com/v1/notifications/unsubscribe?token=')).toBe(true);
    expect(url.startsWith('https://api.properfy.com//')).toBe(false);
  });

  it('supports MARKETING class in the token payload', () => {
    const service = new UnsubscribeTokenService(secret);
    const token = service.generate({ ...baseInput, notificationClass: 'MARKETING' });
    const result = service.verify(token);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.notificationClass).toBe('MARKETING');
    }
  });

  it('uses timing-safe comparison (length mismatch rejected)', () => {
    const service = new UnsubscribeTokenService(secret);
    const token = service.generate(baseInput);
    const [payloadB64] = token.split('.');
    // Append extra chars to the signature — length mismatch
    const tampered = `${payloadB64}.${'a'.repeat(500)}`;
    const result = service.verify(tampered);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_signature');
    }
  });
});
