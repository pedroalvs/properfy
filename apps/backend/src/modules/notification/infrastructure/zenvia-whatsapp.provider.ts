import type { IWhatsAppProvider, WhatsAppSendResult } from '../domain/providers';
import { CircuitBreaker } from '../../../shared/infrastructure/circuit-breaker';

export class ZenviaWhatsAppProvider implements IWhatsAppProvider {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(apiKey: string, apiUrl: string) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
    this.circuitBreaker = new CircuitBreaker({ name: 'zenvia-whatsapp', failureThreshold: 5, resetTimeoutMs: 60000 });
  }

  async send(to: string, bodyText: string): Promise<WhatsAppSendResult> {
    return this.circuitBreaker.execute(async () => {
      const response = await fetch(`${this.apiUrl}/v2/channels/whatsapp/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-TOKEN': this.apiKey,
        },
        body: JSON.stringify({
          from: 'properfy',
          to,
          contents: [{ type: 'text', text: bodyText }],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Zenvia WhatsApp API error (${response.status}): ${errorBody}`);
      }

      const data = (await response.json()) as { id?: string };
      return { messageId: data.id ?? `zenvia-${Date.now()}` };
    });
  }
}
