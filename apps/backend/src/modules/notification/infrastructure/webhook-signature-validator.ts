import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WebhookSignatureValidator {
  validateResend(headers: ResendWebhookHeaders, rawBody: string): boolean;
  validateTwilio(headers: TwilioWebhookHeaders, rawBody: string, url: string): boolean;
  validateZenvia(headers: ZenviaWebhookHeaders, rawBody: string): boolean;
}

export interface ResendWebhookHeaders {
  'svix-id'?: string;
  'svix-timestamp'?: string;
  'svix-signature'?: string;
}

export interface TwilioWebhookHeaders {
  'x-twilio-signature'?: string;
}

export interface ZenviaWebhookHeaders {
  'x-zenvia-signature'?: string;
}

interface WebhookSecrets {
  resendWebhookSecret?: string;
  twilioAuthToken?: string;
  zenviaWebhookSecret?: string;
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

    validateTwilio(headers: TwilioWebhookHeaders, rawBody: string, url: string): boolean {
      const authToken = secrets.twilioAuthToken;
      if (!authToken) return true; // skip validation in dev mode

      const twilioSignature = headers['x-twilio-signature'];
      if (!twilioSignature) return false;

      // Twilio signs: url + sorted form params
      // Parse form params from rawBody (application/x-www-form-urlencoded)
      const params = new URLSearchParams(rawBody);
      const sortedKeys = Array.from(params.keys()).sort();
      let dataString = url;
      for (const key of sortedKeys) {
        dataString += key + params.get(key);
      }

      const expectedSignature = createHmac('sha1', authToken)
        .update(dataString)
        .digest('base64');

      return safeCompare(expectedSignature, twilioSignature);
    },

    validateZenvia(headers: ZenviaWebhookHeaders, rawBody: string): boolean {
      const secret = secrets.zenviaWebhookSecret;
      if (!secret) return true; // skip validation in dev mode

      const zenviaSignature = headers['x-zenvia-signature'];
      if (!zenviaSignature) return false;

      const expectedSignature = createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      return safeCompare(expectedSignature, zenviaSignature);
    },
  };
}
