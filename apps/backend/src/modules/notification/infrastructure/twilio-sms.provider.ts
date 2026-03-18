import twilio from 'twilio';
import type { ISmsProvider, SmsSendResult } from '../domain/providers';
import { CircuitBreaker } from '../../../shared/infrastructure/circuit-breaker';

export class TwilioSmsProvider implements ISmsProvider {
  private readonly client: ReturnType<typeof twilio>;
  private readonly fromNumber: string;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    this.client = twilio(accountSid, authToken);
    this.fromNumber = fromNumber;
    this.circuitBreaker = new CircuitBreaker({ name: 'twilio-sms', failureThreshold: 5, resetTimeoutMs: 60000 });
  }

  async send(to: string, bodyText: string): Promise<SmsSendResult> {
    return this.circuitBreaker.execute(async () => {
      const message = await this.client.messages.create({
        to,
        from: this.fromNumber,
        body: bodyText,
      });

      return { messageId: message.sid };
    });
  }
}
