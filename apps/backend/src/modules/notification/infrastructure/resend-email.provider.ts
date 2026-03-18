import { Resend } from 'resend';
import type { IEmailProvider, EmailSendResult } from '../domain/providers';
import { CircuitBreaker } from '../../../shared/infrastructure/circuit-breaker';

export class ResendEmailProvider implements IEmailProvider {
  private readonly resend: Resend;
  private readonly fromEmail: string;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(apiKey: string, fromEmail: string) {
    this.resend = new Resend(apiKey);
    this.fromEmail = fromEmail;
    this.circuitBreaker = new CircuitBreaker({ name: 'resend-email', failureThreshold: 5, resetTimeoutMs: 60000 });
  }

  async send(to: string, subject: string, bodyHtml: string, bodyText: string): Promise<EmailSendResult> {
    return this.circuitBreaker.execute(async () => {
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject,
        html: bodyHtml,
        text: bodyText,
      });

      if (!response.data) {
        throw new Error(`Resend API returned no data: ${JSON.stringify(response.error)}`);
      }

      return { messageId: response.data.id };
    });
  }
}
