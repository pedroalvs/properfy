import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WebhookSignatureValidator {
  validateResend(headers: ResendWebhookHeaders, rawBody: string): boolean;
  validateMobileMessage(headers: MobileMessageWebhookHeaders, rawBody: string): boolean;
}

export interface ResendWebhookHeaders {
  'svix-id'?: string;
  'svix-timestamp'?: string;
  'svix-signature'?: string;
}

export interface MobileMessageWebhookHeaders {
  'x-mobilemessage-signature'?: string;
}

interface WebhookSecrets {
  resendWebhookSecret?: string;
  mobileMessageWebhookSecret?: string;
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createWebhookSignatureValidator(
  secrets: WebhookSecrets,
): WebhookSignatureValidator {
  return {
    validateResend(headers: ResendWebhookHeaders, rawBody: string): boolean {
      const secret = secrets.resendWebhookSecret;
      if (!secret) return true; // skip validation in dev mode

      const msgId = headers['svix-id'];
      const timestamp = headers['svix-timestamp'];
      const signature = headers['svix-signature'];

      if (!msgId || !timestamp || !signature) return false;

      // Svix signs: msgId.timestamp.body
      const signedContent = `${msgId}.${timestamp}.${rawBody}`;

      // Secret is prefixed with "whsec_" and base64-encoded
      const secretBytes = Buffer.from(
        secret.startsWith('whsec_') ? secret.slice(6) : secret,
        'base64',
      );

      const expectedSignature = createHmac('sha256', secretBytes)
        .update(signedContent)
        .digest('base64');

      // Svix sends multiple signatures separated by space, each prefixed with "v1,"
      const signatures = signature.split(' ');
      for (const sig of signatures) {
        const [version, hash] = sig.split(',');
        if (version === 'v1' && hash && safeCompare(hash, expectedSignature)) {
          return true;
        }
      }

      return false;
    },

    validateMobileMessage(headers: MobileMessageWebhookHeaders, rawBody: string): boolean {
      const secret = secrets.mobileMessageWebhookSecret;
      if (!secret) return true; // skip validation in dev mode

      const incomingSignature = headers['x-mobilemessage-signature'];
      if (!incomingSignature) return false;

      // MobileMessage uses HMAC-SHA256 over the raw body with the webhook secret.
      // Header name and algorithm confirmed with provider support — see DEC-004.
      const expectedSignature = createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      return safeCompare(expectedSignature, incomingSignature);
    },
  };
}
