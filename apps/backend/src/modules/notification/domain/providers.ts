export interface EmailSendResult {
  messageId: string;
}

export interface SmsSendResult {
  messageId: string;
}

export interface IEmailProvider {
  send(to: string, subject: string, bodyHtml: string, bodyText: string): Promise<EmailSendResult>;
}

export interface ISmsProvider {
  send(to: string, bodyText: string): Promise<SmsSendResult>;
}

