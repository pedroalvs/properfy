import type { IWhatsAppProvider, WhatsAppSendResult } from '../domain/providers';

export class StubWhatsAppProvider implements IWhatsAppProvider {
  async send(_to: string, _bodyText: string): Promise<WhatsAppSendResult> {
    return { messageId: `stub-whatsapp-${Date.now()}` };
  }
}
