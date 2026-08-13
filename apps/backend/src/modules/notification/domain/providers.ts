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

/**
 * Which sender/BCC pair an email goes out with. `inspection` is the default
 * agency-facing identity; `system` covers account and operations templates
 * (see SYSTEM_TEMPLATE_CODES in @properfy/shared).
 */
export type EmailIdentity = 'inspection' | 'system';

export interface EmailSendOptions {
  /** Defaults to 'inspection' when omitted. */
  identity?: EmailIdentity;
}

export interface IEmailProvider {
  send(
    to: string,
    subject: string,
    bodyHtml: string,
    bodyText: string,
    options?: EmailSendOptions,
  ): Promise<EmailSendResult>;
}

export interface ISmsProvider {
  send(to: string, bodyText: string, options?: SmsSendOptions): Promise<SmsSendResult>;
  /** Looks up delivery status by provider message id. Null when unknown/unsupported. */
  getStatus(providerMessageId: string): Promise<SmsDeliveryStatus | null>;
}
