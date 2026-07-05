import type { ISmsProvider, SmsSendOptions, SmsSendResult, SmsDeliveryStatus } from '../domain/providers';

export class StubSmsProvider implements ISmsProvider {
  async send(_to: string, _bodyText: string, _options?: SmsSendOptions): Promise<SmsSendResult> {
    return { messageId: `stub-sms-${Date.now()}` };
  }

  async getStatus(_providerMessageId: string): Promise<SmsDeliveryStatus | null> {
    return null;
  }
}
