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

  describe('Twilio', () => {
    const authToken = 'twilio-test-auth-token';

    function makeTwilioSignature(url: string, params: Record<string, string>): string {
      const sortedKeys = Object.keys(params).sort();
      let dataString = url;
      for (const key of sortedKeys) {
        dataString += key + params[key];
      }
      return createHmac('sha1', authToken).update(dataString).digest('base64');
    }

    it('accepts valid Twilio signature', () => {
      const validator = createWebhookSignatureValidator({ twilioAuthToken: authToken });
      const url = 'https://example.com/v1/webhooks/twilio';
      const params = { MessageSid: 'SM123', MessageStatus: 'delivered' };
      const body = new URLSearchParams(params).toString();
      const signature = makeTwilioSignature(url, params);

      const result = validator.validateTwilio(
        { 'x-twilio-signature': signature },
        body,
        url,
      );
      expect(result).toBe(true);
    });

    it('rejects invalid Twilio signature', () => {
      const validator = createWebhookSignatureValidator({ twilioAuthToken: authToken });

      const result = validator.validateTwilio(
        { 'x-twilio-signature': 'invalidsig' },
        'MessageSid=SM123&MessageStatus=delivered',
        'https://example.com/v1/webhooks/twilio',
      );
      expect(result).toBe(false);
    });

    it('rejects when signature header is missing', () => {
      const validator = createWebhookSignatureValidator({ twilioAuthToken: authToken });

      const result = validator.validateTwilio({}, 'body', 'https://example.com/v1/webhooks/twilio');
      expect(result).toBe(false);
    });

    it('skips validation when secret is not configured (dev mode)', () => {
      const validator = createWebhookSignatureValidator({});
      const result = validator.validateTwilio(
        { 'x-twilio-signature': 'anything' },
        'body',
        'https://example.com/v1/webhooks/twilio',
      );
      expect(result).toBe(true);
    });
  });

  describe('Zenvia', () => {
    const secret = 'zenvia-test-secret';

    function makeZenviaSignature(body: string): string {
      return createHmac('sha256', secret).update(body).digest('hex');
    }

    it('accepts valid Zenvia signature', () => {
      const validator = createWebhookSignatureValidator({ zenviaWebhookSecret: secret });
      const body = '{"id":"msg-1","status":"delivered"}';
      const signature = makeZenviaSignature(body);

      const result = validator.validateZenvia(
        { 'x-zenvia-signature': signature },
        body,
      );
      expect(result).toBe(true);
    });

    it('rejects invalid Zenvia signature', () => {
      const validator = createWebhookSignatureValidator({ zenviaWebhookSecret: secret });

      const result = validator.validateZenvia(
        { 'x-zenvia-signature': 'invalidsig' },
        '{"id":"msg-1","status":"delivered"}',
      );
      expect(result).toBe(false);
    });

    it('rejects when signature header is missing', () => {
      const validator = createWebhookSignatureValidator({ zenviaWebhookSecret: secret });

      const result = validator.validateZenvia({}, '{"id":"msg-1"}');
      expect(result).toBe(false);
    });

    it('skips validation when secret is not configured (dev mode)', () => {
      const validator = createWebhookSignatureValidator({});
      const result = validator.validateZenvia(
        { 'x-zenvia-signature': 'anything' },
        'body',
      );
      expect(result).toBe(true);
    });
  });
});
