import { Resend } from 'resend';
import type { IEmailProvider, EmailSendOptions, EmailSendResult } from '../domain/providers';
import { CircuitBreaker } from '../../../shared/infrastructure/circuit-breaker';

export interface ResendIdentityOptions {
  /** Hidden copy on inspection emails; also the system fallback BCC. */
  bccRecipient?: string;
  /** Sender for system emails; falls back to the main fromEmail when unset. */
  systemFromEmail?: string;
  /** Hidden copy on system emails; falls back to bccRecipient when unset. */
  systemBccRecipient?: string;
}

export class ResendEmailProvider implements IEmailProvider {
  private readonly resend: Resend;
  private readonly fromEmail: string;
  private readonly identityOptions: ResendIdentityOptions;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(apiKey: string, fromEmail: string, identityOptions: ResendIdentityOptions = {}) {
    this.resend = new Resend(apiKey);
    this.fromEmail = fromEmail;
    this.identityOptions = identityOptions;
    this.circuitBreaker = new CircuitBreaker({ name: 'resend-email', failureThreshold: 5, resetTimeoutMs: 60000 });
  }

  async send(
    to: string,
    subject: string,
    bodyHtml: string,
    bodyText: string,
    options?: EmailSendOptions,
  ): Promise<EmailSendResult> {
    const system = options?.identity === 'system';
    const from = (system && this.identityOptions.systemFromEmail) || this.fromEmail;
    const bcc = system
      ? this.identityOptions.systemBccRecipient ?? this.identityOptions.bccRecipient
      : this.identityOptions.bccRecipient;

    return this.circuitBreaker.execute(async () => {
      const response = await this.resend.emails.send({
        from,
        to,
        subject,
        html: bodyHtml,
        text: bodyText,
        ...(bcc ? { bcc } : {}),
      });

      if (!response.data) {
        throw new Error(`Resend API returned no data: ${JSON.stringify(response.error)}`);
      }

      return { messageId: response.data.id };
    });
  }
}
