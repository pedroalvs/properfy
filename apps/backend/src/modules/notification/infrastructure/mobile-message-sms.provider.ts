import type { ISmsProvider, SmsSendResult } from '../domain/providers';
import { CircuitBreaker } from '../../../shared/infrastructure/circuit-breaker';

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

  async send(to: string, bodyText: string): Promise<SmsSendResult> {
    return this.circuitBreaker.execute(async () => {
      const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      const response = await fetch(`${this.apiUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`,
        },
        body: JSON.stringify({
          messages: [
            {
              to,
              body: bodyText,
              custom_ref: `properfy-${Date.now()}`,
            },
          ],
          from: this.senderId,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`MobileMessage API error (${response.status}): ${errorBody}`);
      }

      const data = (await response.json()) as { messages?: Array<{ message_id?: string }> };
      const messageId = data.messages?.[0]?.message_id ?? `mm-${Date.now()}`;
      return { messageId };
    });
  }
}
