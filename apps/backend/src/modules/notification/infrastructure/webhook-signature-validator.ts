import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WebhookSignatureValidator {
  validateResend(headers: ResendWebhookHeaders, rawBody: string): boolean;
}

export interface ResendWebhookHeaders {
  'svix-id'?: string;
  'svix-timestamp'?: string;
  'svix-signature'?: string;
}

interface WebhookSecrets {
  resendWebhookSecret?: string;
}

// MobileMessage does not sign webhooks — the dashboard only provides URLs with
// no secret/HMAC capability. Requests are accepted without signature validation.
// IP allowlisting at the infrastructure level is the recommended mitigation.

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
  };
}
