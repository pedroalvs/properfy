export interface EmailSendResult {
  messageId: string;
}

export interface SmsSendResult {
  messageId: string;
}

export interface SmsSendOptions {
  /** Sent as the Idempotency-Key header so provider-side retries never duplicate sends. */
  idempotencyKey?: string;
  /** Provider-side tracking reference; correlates provider records back to a notification. */
  customRef?: string;
  /** Enable UCS-2 encoding for bodies containing non-GSM-7 characters. */
  enableUnicode?: boolean;
}

/** Terminal + in-flight delivery statuses as reported by the SMS provider. */
export type SmsDeliveryStatus = 'pending' | 'scheduled' | 'sent' | 'delivered' | 'failed' | 'cancelled';

export interface IEmailProvider {
  send(to: string, subject: string, bodyHtml: string, bodyText: string): Promise<EmailSendResult>;
}

export interface ISmsProvider {
  send(to: string, bodyText: string, options?: SmsSendOptions): Promise<SmsSendResult>;
  /** Looks up delivery status by provider message id. Null when unknown/unsupported. */
  getStatus(providerMessageId: string): Promise<SmsDeliveryStatus | null>;
}
