import twilio from 'twilio';
import type { ISmsProvider, SmsSendResult } from '../domain/providers';

export class TwilioSmsProvider implements ISmsProvider {
  private readonly client: ReturnType<typeof twilio>;
  private readonly fromNumber: string;

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    this.client = twilio(accountSid, authToken);
    this.fromNumber = fromNumber;
  }

  async send(to: string, bodyText: string): Promise<SmsSendResult> {
    const message = await this.client.messages.create({
      to,
      from: this.fromNumber,
      body: bodyText,
    });

    return { messageId: message.sid };
  }
}
