import type { ISmsProvider, SmsSendOptions, SmsSendResult, SmsDeliveryStatus } from '../domain/providers';
import { CircuitBreaker } from '../../../shared/infrastructure/circuit-breaker';

const REQUEST_TIMEOUT_MS = 10_000;

const DELIVERY_STATUSES: readonly SmsDeliveryStatus[] = [
  'pending',
  'scheduled',
  'sent',
  'delivered',
  'failed',
  'cancelled',
];

interface MobileMessageResult {
  status?: string;
  message_id?: string;
  error?: string;
  cost?: number;
  encoding?: string;
}

export class MobileMessageSmsProvider implements ISmsProvider {
  private readonly username: string;
  private readonly password: string;
  private readonly senderId: string;
  private readonly apiUrl: string;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(username: string, password: string, senderId: string, apiUrl = 'https://api.mobilemessage.com.au') {
    this.username = username;
    this.password = password;
    this.senderId = senderId;
    this.apiUrl = apiUrl;
    this.circuitBreaker = new CircuitBreaker({ name: 'mobile-message-sms', failureThreshold: 5, resetTimeoutMs: 60000 });
  }

  private authHeader(): string {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return `Basic ${credentials}`;
  }

  async send(to: string, bodyText: string, options?: SmsSendOptions): Promise<SmsSendResult> {
    return this.circuitBreaker.execute(async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': this.authHeader(),
      };
      if (options?.idempotencyKey) {
        headers['Idempotency-Key'] = options.idempotencyKey;
      }

      const payload: Record<string, unknown> = {
        messages: [
          {
            to,
            message: bodyText,
            sender: this.senderId,
            ...(options?.customRef ? { custom_ref: options.customRef } : {}),
          },
        ],
      };
      if (options?.enableUnicode) {
        payload['enable_unicode'] = true;
      }

      const response = await fetch(`${this.apiUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 429) {
        const errorBody = await response.text();
        throw new Error(`MobileMessage rate limit exceeded (429): ${errorBody}`);
      }
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`MobileMessage API error (${response.status}): ${errorBody}`);
      }

      const data = (await response.json()) as { results?: MobileMessageResult[] };
      const result = data.results?.[0];
      if (result?.status === 'error') {
        throw new Error(`MobileMessage per-message error: ${result.error ?? 'unknown error'}`);
      }
      if (!result?.message_id) {
        // Never fabricate an id: persisting a fake providerMessageId would make delivery
        // receipts unmatchable forever. Throwing lets the retry motor re-attempt safely
        // (the Idempotency-Key prevents duplicate sends on the provider side).
        throw new Error('MobileMessage response missing message_id');
      }
      return { messageId: result.message_id };
    });
  }

  async getStatus(providerMessageId: string): Promise<SmsDeliveryStatus | null> {
    const response = await fetch(
      `${this.apiUrl}/v1/messages?message_id=${encodeURIComponent(providerMessageId)}`,
      {
        method: 'GET',
        headers: { 'Authorization': this.authHeader() },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (response.status === 404) return null;
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`MobileMessage status lookup error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as { results?: MobileMessageResult[] };
    const status = data.results?.[0]?.status;
    return DELIVERY_STATUSES.includes(status as SmsDeliveryStatus) ? (status as SmsDeliveryStatus) : null;
  }
}
