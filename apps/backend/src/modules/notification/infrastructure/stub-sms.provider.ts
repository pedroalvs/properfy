import type { ISmsProvider, SmsSendResult } from '../domain/providers';

export class StubSmsProvider implements ISmsProvider {
  async send(_to: string, _bodyText: string): Promise<SmsSendResult> {
    return { messageId: `stub-sms-${Date.now()}` };
  }
}
