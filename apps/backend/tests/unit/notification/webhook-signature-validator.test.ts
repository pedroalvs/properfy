import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { createWebhookSignatureValidator } from '../../../src/modules/notification/infrastructure/webhook-signature-validator';

describe('WebhookSignatureValidator', () => {
  describe('Resend (Svix)', () => {
    const secret = 'whsec_' + Buffer.from('test-secret-key-32bytes!').toString('base64');
    const secretBytes = Buffer.from('test-secret-key-32bytes!');

    function makeResendSignature(msgId: string, timestamp: string, body: string): string {
      const signedContent = `${msgId}.${timestamp}.${body}`;
      const hash = createHmac('sha256', secretBytes).update(signedContent).digest('base64');
      return `v1,${hash}`;
    }

    it('accepts valid Resend signature', () => {
      const validator = createWebhookSignatureValidator({ resendWebhookSecret: secret });
      const body = '{"type":"email.delivered","data":{"id":"msg-1"}}';
      const msgId = 'msg_123';
      const timestamp = '1700000000';
      const signature = makeResendSignature(msgId, timestamp, body);

      const result = validator.validateResend(
        { 'svix-id': msgId, 'svix-timestamp': timestamp, 'svix-signature': signature },
        body,
      );
      expect(result).toBe(true);
    });

    it('rejects invalid Resend signature', () => {
      const validator = createWebhookSignatureValidator({ resendWebhookSecret: secret });
      const body = '{"type":"email.delivered","data":{"id":"msg-1"}}';

      const result = validator.validateResend(
        { 'svix-id': 'msg_123', 'svix-timestamp': '1700000000', 'svix-signature': 'v1,invalidsignature' },
        body,
      );
      expect(result).toBe(false);
    });

    it('rejects when required headers are missing', () => {
      const validator = createWebhookSignatureValidator({ resendWebhookSecret: secret });

      expect(validator.validateResend({ 'svix-id': 'msg_123' }, 'body')).toBe(false);
      expect(validator.validateResend({ 'svix-timestamp': '123' }, 'body')).toBe(false);
      expect(validator.validateResend({ 'svix-signature': 'v1,abc' }, 'body')).toBe(false);
      expect(validator.validateResend({}, 'body')).toBe(false);
    });

    it('skips validation when secret is not configured (dev mode)', () => {
      const validator = createWebhookSignatureValidator({});
      const result = validator.validateResend(
        { 'svix-id': 'msg_123', 'svix-timestamp': '123', 'svix-signature': 'v1,anything' },
        'body',
      );
      expect(result).toBe(true);
    });

    it('accepts when multiple signatures are present and one is valid', () => {
      const validator = createWebhookSignatureValidator({ resendWebhookSecret: secret });
      const body = '{"data":{}}';
      const msgId = 'msg_456';
      const timestamp = '1700000001';
      const validSig = makeResendSignature(msgId, timestamp, body);
      const multiSig = `v1,invalidsig ${validSig}`;

      const result = validator.validateResend(
        { 'svix-id': msgId, 'svix-timestamp': timestamp, 'svix-signature': multiSig },
        body,
      );
      expect(result).toBe(true);
    });
  });

  describe('MobileMessage', () => {
    // MobileMessage does not sign webhooks — no secret/HMAC available in dashboard.
    // The webhook route accepts all POST requests from the provider without validation.
    // This is documented in DEC-004 and in webhook-signature-validator.ts.
    it('documents that MobileMessage has no webhook signature support', () => {
      const validator = createWebhookSignatureValidator({});
      // validateResend is the only method — no validateMobileMessage exists
      expect(typeof validator.validateResend).toBe('function');
      expect((validator as Record<string, unknown>).validateMobileMessage).toBeUndefined();
    });
  });
});
