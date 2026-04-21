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
    const secret = 'mobile-message-test-secret';

    function makeMobileMessageSignature(body: string): string {
      return createHmac('sha256', secret).update(body).digest('hex');
    }

    it('accepts valid MobileMessage signature', () => {
      const validator = createWebhookSignatureValidator({ mobileMessageWebhookSecret: secret });
      const body = '{"message_id":"mm-1","status":"delivered"}';
      const signature = makeMobileMessageSignature(body);

      const result = validator.validateMobileMessage(
        { 'x-mobilemessage-signature': signature },
        body,
      );
      expect(result).toBe(true);
    });

    it('rejects invalid MobileMessage signature', () => {
      const validator = createWebhookSignatureValidator({ mobileMessageWebhookSecret: secret });

      const result = validator.validateMobileMessage(
        { 'x-mobilemessage-signature': 'invalidsig' },
        '{"message_id":"mm-1","status":"delivered"}',
      );
      expect(result).toBe(false);
    });

    it('rejects when signature header is missing', () => {
      const validator = createWebhookSignatureValidator({ mobileMessageWebhookSecret: secret });

      const result = validator.validateMobileMessage({}, '{"message_id":"mm-1"}');
      expect(result).toBe(false);
    });

    it('skips validation when secret is not configured (dev mode)', () => {
      const validator = createWebhookSignatureValidator({});
      const result = validator.validateMobileMessage(
        { 'x-mobilemessage-signature': 'anything' },
        'body',
      );
      expect(result).toBe(true);
    });
  });
});
