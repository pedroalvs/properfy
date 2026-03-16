import type { IEmailProvider, EmailSendResult } from '../domain/providers';

export class StubEmailProvider implements IEmailProvider {
  async send(_to: string, _subject: string, _bodyHtml: string, _bodyText: string): Promise<EmailSendResult> {
    return { messageId: `stub-email-${Date.now()}` };
  }
}
